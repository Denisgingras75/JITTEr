package com.anvil.keyboard

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.round
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * TapMotionAnalyzer - measures how much each key tap physically jolts the phone
 *
 * A real finger hitting the glass gives the phone a small kick: a short spike
 * in the accelerometer (and usually the gyroscope) within a few ms of the touch
 * being reported. Taps injected by software (adb, accessibility services,
 * emulators) produce no kick, and their touch size/pressure is usually
 * constant. That makes phone motion a cheap second channel next to keystroke
 * timing.
 *
 * This is a measurement, not a verdict: a phone lying on a table jolts much
 * less than one held in the hand, so weak or missing motion is not proof of
 * a bot.
 *
 * The keyboard's own haptic feedback also shakes the phone, and it fires for
 * injected taps too. Call onHaptic() whenever the keyboard vibrates so those
 * samples are ignored; otherwise every tap would look physical.
 *
 * Plain Kotlin with no Android imports, so it runs in JVM unit tests.
 * TapMotionSensor feeds it from SensorManager. All public methods are
 * synchronized: samples arrive on the sensor thread, touches on the UI thread.
 *
 * Privacy (Hard Rule #1): raw samples live only in a ~2 s in-memory ring
 * buffer. Per-tap values are never tied to a key and never persisted; only
 * session aggregates leave this class. Only magnitudes are kept, never the
 * direction of motion, which could hint at where on the keyboard a tap landed.
 */
class TapMotionAnalyzer(capacity: Int = DEFAULT_CAPACITY) {

    private val accel = SampleRing(capacity)
    private val gyro = SampleRing(capacity)
    private val pending = ArrayDeque<PendingTap>()
    private val haptics = Intervals(MAX_HAPTICS)

    // Session aggregates
    private var tapsSeen = 0
    private var tapsAnalyzed = 0
    private var tapsWithImpulse = 0
    private var accelSamples = 0L
    private var firstAccelT = 0L
    private var lastAccelT = 0L
    private var accelPeak = RunningStats()
    private var gyroPeak = RunningStats()
    private var latencyMs = RunningStats()
    private var touchSize = RunningStats()
    private var pressure = RunningStats()
    private var sizeVsJolt = Correlation()

    // ============ INPUT ============

    @Synchronized
    fun addAccel(tNanos: Long, x: Float, y: Float, z: Float) {
        if (!accel.add(tNanos, x, y, z)) return
        if (accelSamples == 0L) firstAccelT = tNanos
        lastAccelT = tNanos
        accelSamples++
        drain()
    }

    @Synchronized
    fun addGyro(tNanos: Long, x: Float, y: Float, z: Float) {
        gyro.add(tNanos, x, y, z)
    }

    /** Call on every ACTION_DOWN, with the touch time on the sensor clock. */
    @Synchronized
    fun onTouchDown(tNanos: Long, touchMajor: Float, pressure: Float) {
        tapsSeen++
        touchSize.add(touchMajor.toDouble())
        this.pressure.add(pressure.toDouble())
        if (pending.size >= MAX_PENDING) pending.removeFirst()
        pending.addLast(PendingTap(tNanos, touchMajor))
        drain()
    }

    /** Call when the keyboard fires its own vibration, with the time on the sensor clock. */
    @Synchronized
    fun onHaptic(tNanos: Long) {
        haptics.add(tNanos - HAPTIC_LEAD, tNanos + HAPTIC_MASK)
    }

    // ============ OUTPUT ============

    /** Share of analysed taps (this session) that jolted the phone, or null until there are enough. */
    @Synchronized
    fun liveImpulsePercent(): Int? {
        if (tapsAnalyzed < MIN_TAPS_FOR_LIVE) return null
        return (100.0 * tapsWithImpulse / tapsAnalyzed).roundToInt()
    }

    @Synchronized
    fun summary(): MotionSummary {
        val sampleRate = if (accelSamples > 1 && lastAccelT > firstAccelT) {
            (accelSamples - 1) * 1e9 / (lastAccelT - firstAccelT)
        } else 0.0
        val impulseRate = if (tapsAnalyzed > 0) tapsWithImpulse.toDouble() / tapsAnalyzed else 0.0

        val flags = mutableListOf<String>()
        if (tapsSeen > 0 && accelSamples == 0L) flags.add(FLAG_NO_MOTION_DATA)
        if (accelSamples > 1 && sampleRate < MIN_SAMPLE_RATE_HZ) flags.add(FLAG_LOW_SAMPLE_RATE)
        if (touchSize.n >= MIN_TAPS_FOR_CONSTANCY && touchSize.range < 1e-3) flags.add(FLAG_CONSTANT_TOUCH_SIZE)
        if (pressure.n >= MIN_TAPS_FOR_CONSTANCY && pressure.range < 1e-4) flags.add(FLAG_CONSTANT_PRESSURE)

        val evidence = if (sampleRate < MIN_SAMPLE_RATE_HZ) EVIDENCE_UNAVAILABLE
        else classify(tapsAnalyzed.toLong(), impulseRate)

        return MotionSummary(
            evidence = evidence,
            tapsSeen = tapsSeen,
            tapsAnalyzed = tapsAnalyzed,
            tapsWithImpulse = tapsWithImpulse,
            impulseRate = round3(impulseRate),
            accelPeakMean = round3(accelPeak.mean),
            accelPeakCv = round3(accelPeak.cv),
            gyroPeakMean = round3(gyroPeak.mean),
            latencyMsMean = round3(latencyMs.mean),
            latencyMsStd = round3(latencyMs.std),
            touchSizeCv = round3(touchSize.cv),
            pressureCv = round3(pressure.cv),
            sizeJoltCorrelation = sizeVsJolt.value()?.let { round3(it) },
            sampleRateHz = round3(sampleRate),
            flags = flags
        )
    }

    /**
     * Summarises the session and starts a new one. Taps still waiting for
     * their post-tap samples are dropped (not counted as analysed).
     */
    @Synchronized
    fun finishSession(): MotionSessionResult {
        val result = MotionSessionResult(summary(), accelPeak.copy(), latencyMs.copy())
        resetSession()
        return result
    }

    @Synchronized
    fun resetSession() {
        pending.clear()
        tapsSeen = 0
        tapsAnalyzed = 0
        tapsWithImpulse = 0
        accelSamples = 0L
        firstAccelT = 0L
        lastAccelT = 0L
        accelPeak = RunningStats()
        gyroPeak = RunningStats()
        latencyMs = RunningStats()
        touchSize = RunningStats()
        pressure = RunningStats()
        sizeVsJolt = Correlation()
    }

    /** Drops buffered samples, e.g. when the sensors are switched off. */
    @Synchronized
    fun clearSamples() {
        accel.clear()
        gyro.clear()
    }

    // ============ ANALYSIS ============

    /** Analyses every pending tap whose post-tap window has fully arrived. */
    private fun drain() {
        while (pending.isNotEmpty()) {
            val tap = pending.first()
            if (accel.size == 0 || accel.lastT < tap.tNanos + WINDOW_AFTER + DRAIN_MARGIN) return
            pending.removeFirst()
            record(tap)
        }
    }

    private fun record(tap: PendingTap) {
        // No usable samples around this tap (sensor gap, clock mismatch): not analysed.
        val jolt = measure(accel, tap.tNanos, MIN_ACCEL_FLOOR) ?: return
        val twist = measure(gyro, tap.tNanos, MIN_GYRO_FLOOR)

        tapsAnalyzed++
        sizeVsJolt.add(tap.touchMajor.toDouble(), jolt.prominence)
        if (jolt.detected) {
            tapsWithImpulse++
            accelPeak.add(jolt.prominence)
            latencyMs.add(jolt.latencyMs)
            if (twist != null) gyroPeak.add(twist.prominence)
        }
    }

    /**
     * Compares how sharply the reading changes around the tap with the quiet
     * period just before it. Works on the change over ~5 ms rather than the raw
     * reading: a jolt changes it fast, while tilting or walking with the phone
     * changes it slowly, so drift doesn't hide taps or pass for one.
     */
    private fun measure(ring: SampleRing, tapT: Long, minFloor: Double): Jolt? {
        // A tap that lands while our own vibration plays can't be judged either way.
        val coreTotal = ring.count(tapT - CORE_BEFORE, tapT + CORE_AFTER, null)
        val coreClean = ring.count(tapT - CORE_BEFORE, tapT + CORE_AFTER, haptics)
        if (coreClean < MIN_CORE_SAMPLES || coreClean < MIN_CORE_CLEAN_SHARE * coreTotal) return null

        val base = changes(ring.window(tapT - BASELINE_BEFORE, tapT - BASELINE_GAP, haptics), Long.MIN_VALUE)
        if (base.size < MIN_BASELINE_SAMPLES) return null
        // Start a little early so the first samples in the window have a partner ~5 ms back.
        val window = changes(ring.window(tapT - WINDOW_BEFORE - LAG_MAX, tapT + WINDOW_AFTER, haptics), tapT - WINDOW_BEFORE)
        if (window.size < MIN_WINDOW_SAMPLES) return null

        val noise = median(base.values())
        var peakIndex = 0
        for (i in 0 until window.size) if (window.v[i] > window.v[peakIndex]) peakIndex = i
        val prominence = window.v[peakIndex] - median(window.values())
        val floor = max(noise * NOISE_MULTIPLIER, minFloor)

        return Jolt(
            prominence = prominence,
            latencyMs = (window.t[peakIndex] - tapT) / 1e6,
            detected = prominence > floor
        )
    }

    /**
     * |x(t) - x(t - ~5 ms)| at each sample from [from] on. The lag is in time,
     * not samples, so 100-500 Hz sensors give comparable numbers. Samples with
     * no partner ~5 ms earlier (window start, gaps left by masking) are skipped.
     */
    private fun changes(w: SampleRing.Window, from: Long): Changes {
        val out = Changes(w.size)
        var partner = -1
        for (k in 0 until w.size) {
            while (partner + 1 < k && w.t[k] - w.t[partner + 1] >= LAG_MIN) partner++
            if (partner < 0 || w.t[k] < from) continue
            val dt = w.t[k] - w.t[partner]
            if (dt < LAG_MIN || dt > LAG_MAX) continue
            out.add(w.t[k], norm(w.x[k] - w.x[partner], w.y[k] - w.y[partner], w.z[k] - w.z[partner]))
        }
        return out
    }

    private class Changes(capacity: Int) {
        val t = LongArray(capacity)
        val v = DoubleArray(capacity)
        var size = 0
            private set

        fun add(time: Long, value: Double) {
            t[size] = time
            v[size] = value
            size++
        }

        fun values(): DoubleArray = v.copyOf(size)
    }

    private class Jolt(val prominence: Double, val latencyMs: Double, val detected: Boolean)

    private class PendingTap(val tNanos: Long, val touchMajor: Float)

    companion object {
        private const val MS = 1_000_000L
        private const val DEFAULT_CAPACITY = 1024     // ~2 s at 500 Hz

        // Quiet period used as the baseline: 250 ms to 30 ms before the touch.
        private const val BASELINE_BEFORE = 250 * MS
        private const val BASELINE_GAP = 30 * MS
        // Where the jolt should be: touch timestamps can trail the physical contact slightly.
        private const val WINDOW_BEFORE = 20 * MS
        private const val WINDOW_AFTER = 40 * MS
        private const val DRAIN_MARGIN = 20 * MS
        // "Change over ~5 ms": partner sample must be 4-12 ms earlier.
        private const val LAG_MIN = 4 * MS
        private const val LAG_MAX = 12 * MS
        // Where the jolt peaks; this part must be mostly free of our own vibration.
        private const val CORE_BEFORE = 15 * MS
        private const val CORE_AFTER = 15 * MS
        private const val MIN_CORE_SAMPLES = 3
        private const val MIN_CORE_CLEAN_SHARE = 0.6

        private const val MIN_BASELINE_SAMPLES = 4
        private const val MIN_WINDOW_SAMPLES = 4
        private const val MAX_PENDING = 64

        // Samples ignored around our own vibration: 20 ms pulse plus motor ring-down.
        private const val HAPTIC_LEAD = 2 * MS
        private const val HAPTIC_MASK = 50 * MS
        private const val MAX_HAPTICS = 32

        // Initial thresholds, to be calibrated on real devices.
        private const val NOISE_MULTIPLIER = 3.0
        private const val MIN_ACCEL_FLOOR = 0.03      // m/s^2
        private const val MIN_GYRO_FLOOR = 0.005      // rad/s
        const val MIN_SAMPLE_RATE_HZ = 100.0
        const val MIN_TAPS_FOR_EVIDENCE = 10
        private const val MIN_TAPS_FOR_LIVE = 5
        private const val MIN_TAPS_FOR_CONSTANCY = 20
        private const val STRONG_RATE = 0.6
        private const val WEAK_RATE = 0.2

        const val EVIDENCE_UNAVAILABLE = "unavailable"
        const val EVIDENCE_NONE = "none"
        const val EVIDENCE_WEAK = "weak"
        const val EVIDENCE_STRONG = "strong"

        const val FLAG_NO_MOTION_DATA = "no_motion_data"
        const val FLAG_LOW_SAMPLE_RATE = "low_sample_rate"
        const val FLAG_CONSTANT_TOUCH_SIZE = "constant_touch_size"
        const val FLAG_CONSTANT_PRESSURE = "constant_pressure"

        /** Evidence level from how many taps were measured and how many of them jolted the phone. */
        fun classify(tapsAnalyzed: Long, impulseRate: Double): String = when {
            tapsAnalyzed < MIN_TAPS_FOR_EVIDENCE -> EVIDENCE_UNAVAILABLE
            impulseRate >= STRONG_RATE -> EVIDENCE_STRONG
            impulseRate >= WEAK_RATE -> EVIDENCE_WEAK
            else -> EVIDENCE_NONE
        }

        private fun norm(x: Double, y: Double, z: Double): Double = sqrt(x * x + y * y + z * z)

        /** Median; sorts the array in place. */
        private fun median(values: DoubleArray): Double {
            values.sort()
            val mid = values.size / 2
            return if (values.size % 2 == 1) values[mid] else (values[mid - 1] + values[mid]) / 2
        }

        private fun round3(v: Double): Double = if (v.isFinite()) round(v * 1000) / 1000 else 0.0
    }
}

/** Fixed-size ring buffer of 3-axis samples in time order. */
private class SampleRing(private val capacity: Int) {
    private val t = LongArray(capacity)
    private val x = FloatArray(capacity)
    private val y = FloatArray(capacity)
    private val z = FloatArray(capacity)
    private var next = 0

    var size = 0
        private set
    var lastT = 0L
        private set

    /** Returns false (and drops the sample) if it is out of time order. */
    fun add(tNanos: Long, xv: Float, yv: Float, zv: Float): Boolean {
        if (size > 0 && tNanos < lastT) return false
        t[next] = tNanos
        x[next] = xv
        y[next] = yv
        z[next] = zv
        next = (next + 1) % capacity
        if (size < capacity) size++
        lastT = tNanos
        return true
    }

    fun clear() {
        size = 0
        next = 0
        lastT = 0L
    }

    /** Counts the samples with timestamps in [from, to], skipping any inside [skip]. */
    fun count(from: Long, to: Long, skip: Intervals?): Int {
        val start = (next - size + capacity) % capacity
        var n = 0
        for (i in 0 until size) {
            val ts = t[(start + i) % capacity]
            if (ts in from..to && (skip == null || !skip.contains(ts))) n++
        }
        return n
    }

    /** Copies out the samples with timestamps in [from, to], skipping any inside [skip]. */
    fun window(from: Long, to: Long, skip: Intervals): Window {
        val start = (next - size + capacity) % capacity
        val w = Window(count(from, to, skip))
        var j = 0
        for (i in 0 until size) {
            val k = (start + i) % capacity
            if (t[k] in from..to && !skip.contains(t[k])) {
                w.t[j] = t[k]
                w.x[j] = x[k].toDouble()
                w.y[j] = y[k].toDouble()
                w.z[j] = z[k].toDouble()
                j++
            }
        }
        return w
    }

    class Window(val size: Int) {
        val t = LongArray(size)
        val x = DoubleArray(size)
        val y = DoubleArray(size)
        val z = DoubleArray(size)
    }
}

/** The most recent [capacity] time intervals, oldest overwritten first. */
private class Intervals(private val capacity: Int) {
    private val starts = LongArray(capacity)
    private val ends = LongArray(capacity)
    private var next = 0
    private var size = 0

    fun add(start: Long, end: Long) {
        starts[next] = start
        ends[next] = end
        next = (next + 1) % capacity
        if (size < capacity) size++
    }

    fun contains(t: Long): Boolean {
        for (i in 0 until size) if (t >= starts[i] && t <= ends[i]) return true
        return false
    }
}

/** Mean/variance/min/max in one pass (Welford), mergeable across sessions. */
class RunningStats {
    var n: Long = 0
    var mean: Double = 0.0
    var m2: Double = 0.0
    var min: Double = 0.0
    var max: Double = 0.0

    fun add(value: Double) {
        if (value.isNaN() || value.isInfinite()) return
        n++
        if (n == 1L) {
            min = value
            max = value
        } else {
            if (value < min) min = value
            if (value > max) max = value
        }
        val delta = value - mean
        mean += delta / n
        m2 += delta * (value - mean)
    }

    /** Combines another set of stats into this one (Chan et al. parallel update). */
    fun merge(other: RunningStats) {
        if (other.n == 0L) return
        if (n == 0L) {
            n = other.n
            mean = other.mean
            m2 = other.m2
            min = other.min
            max = other.max
            return
        }
        val total = n + other.n
        val delta = other.mean - mean
        mean += delta * other.n / total
        m2 += other.m2 + delta * delta * n * other.n / total
        min = minOf(min, other.min)
        max = maxOf(max, other.max)
        n = total
    }

    fun copy(): RunningStats = RunningStats().also { it.merge(this) }

    val variance: Double get() = if (n > 1) m2 / (n - 1) else 0.0
    val std: Double get() = sqrt(variance)
    val cv: Double get() = if (n > 1 && mean != 0.0) std / abs(mean) else 0.0
    val range: Double get() = if (n > 0) max - min else 0.0
}

/** Pearson correlation from running sums. */
private class Correlation {
    private var n = 0L
    private var sx = 0.0
    private var sy = 0.0
    private var sxx = 0.0
    private var syy = 0.0
    private var sxy = 0.0

    fun add(x: Double, y: Double) {
        n++
        sx += x
        sy += y
        sxx += x * x
        syy += y * y
        sxy += x * y
    }

    /** Null until there are enough points, or when either side doesn't vary. */
    fun value(): Double? {
        if (n < 10) return null
        val vx = sxx - sx * sx / n
        val vy = syy - sy * sy / n
        if (vx <= 1e-12 || vy <= 1e-12) return null
        return ((sxy - sx * sy / n) / sqrt(vx * vy)).coerceIn(-1.0, 1.0)
    }
}

/** What one keyboard session's taps did to the motion sensors. Aggregates only. */
data class MotionSummary(
    val evidence: String,
    val tapsSeen: Int,
    val tapsAnalyzed: Int,
    val tapsWithImpulse: Int,
    val impulseRate: Double,
    val accelPeakMean: Double,     // m/s^2 change over ~5 ms, taps with a jolt
    val accelPeakCv: Double,
    val gyroPeakMean: Double,      // rad/s, taps with a jolt
    val latencyMsMean: Double,     // jolt peak relative to the reported touch
    val latencyMsStd: Double,
    val touchSizeCv: Double,
    val pressureCv: Double,
    val sizeJoltCorrelation: Double?,
    val sampleRateHz: Double,
    val flags: List<String>
)

/** A finished session: the summary plus the stats needed to merge it into the lifetime profile. */
class MotionSessionResult(
    val summary: MotionSummary,
    val accelPeak: RunningStats,
    val latencyMs: RunningStats
)
