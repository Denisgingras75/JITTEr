package com.anvil.keyboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Drives TapMotionAnalyzer with simulated sensor streams: gravity, sensor
 * noise, optional slow tilt / hand wobble, and a decaying jolt at each real tap.
 */
class TapMotionAnalyzerTest {

    private val ms = 1_000_000L

    /** [hapticAt]: when the keyboard's own vibration fires (key-up handled on the UI thread). */
    private class Tap(val t: Long, val jolt: Double, val twist: Double, val size: Float, val pressure: Float, val hapticAt: Long)

    private class Scenario(
        val rateHz: Double = 200.0,
        val accelNoise: Double = 0.015,     // m/s^2 per axis
        val gyroNoise: Double = 0.002,      // rad/s per axis
        val tiltRadPerSec: Double = 0.0,    // slow change in how the phone is held
        val wobble: Double = 0.0,           // low-frequency hand motion, m/s^2
        val withSensors: Boolean = true,
        val touchDeliveryDelay: Long = 20 * 1_000_000L,
        val hapticAmp: Double = 0.0,        // our own vibration, m/s^2
        val markHaptics: Boolean = true,    // whether the analyzer is told about it
        val seed: Long = 1
    )

    // ---------- simulation ----------

    private fun humanTaps(
        count: Int,
        seed: Long,
        minGapMs: Int = 180,
        maxGapMs: Int = 400,
        joltMin: Double = 0.3,
        joltMax: Double = 1.2,
        minDwellMs: Int = 60,
        maxDwellMs: Int = 120
    ): List<Tap> {
        val rnd = java.util.Random(seed)
        var t = 1000 * ms
        return List(count) {
            t += (minGapMs + rnd.nextInt(maxGapMs - minGapMs + 1)) * ms
            val jolt = joltMin + rnd.nextDouble() * (joltMax - joltMin)
            val dwell = minDwellMs + rnd.nextInt(maxDwellMs - minDwellMs + 1)
            Tap(
                t = t,
                jolt = jolt,
                twist = jolt * 0.15,
                size = (45 + 25 * jolt + rnd.nextGaussian() * 2).toFloat(),
                pressure = (0.3 + 0.4 * jolt + rnd.nextGaussian() * 0.02).toFloat(),
                hapticAt = t + (dwell + 20) * ms
            )
        }
    }

    /**
     * Same timing as a human, but no physical contact, constant touch data, and
     * down/up sent together (adb / accessibility injection) - so the keyboard
     * still vibrates, right after the touch.
     */
    private fun injectedTaps(count: Int, seed: Long): List<Tap> =
        humanTaps(count, seed).map { Tap(it.t, jolt = 0.0, twist = 0.0, size = 1f, pressure = 1f, hapticAt = it.t + 21 * ms) }

    private fun run(analyzer: TapMotionAnalyzer, taps: List<Tap>, s: Scenario = Scenario()): MotionSummary {
        val rnd = java.util.Random(s.seed)
        val period = (1e9 / s.rateHz).toLong()
        val end = (taps.maxOfOrNull { it.t } ?: 0L) + 500 * ms
        var next = 0
        var nextHaptic = 0
        val byHaptic = taps.sortedBy { it.hapticAt }
        var t = 0L
        while (t <= end) {
            // The UI thread sees each touch a little after its timestamp.
            while (next < taps.size && taps[next].t + s.touchDeliveryDelay <= t) {
                val tap = taps[next++]
                analyzer.onTouchDown(tap.t, tap.size, tap.pressure)
            }
            while (nextHaptic < byHaptic.size && byHaptic[nextHaptic].hapticAt <= t) {
                val tap = byHaptic[nextHaptic++]
                if (s.markHaptics) analyzer.onHaptic(tap.hapticAt)
            }
            if (s.withSensors) {
                val a = accel(t, taps, s)
                val g = gyro(t, taps)
                analyzer.addAccel(t, noisy(a[0], s.accelNoise, rnd), noisy(a[1], s.accelNoise, rnd), noisy(a[2], s.accelNoise, rnd))
                analyzer.addGyro(t, noisy(g[0], s.gyroNoise, rnd), noisy(g[1], s.gyroNoise, rnd), noisy(g[2], s.gyroNoise, rnd))
            }
            t += period
        }
        while (next < taps.size) {
            val tap = taps[next++]
            analyzer.onTouchDown(tap.t, tap.size, tap.pressure)
        }
        return analyzer.summary()
    }

    private fun accel(t: Long, taps: List<Tap>, s: Scenario): DoubleArray {
        val sec = t / 1e9
        val theta = s.tiltRadPerSec * sec
        val out = doubleArrayOf(9.81 * sin(theta), 0.0, 9.81 * cos(theta))
        if (s.wobble > 0) {
            out[0] += s.wobble * sin(2 * PI * 1.3 * sec)
            out[1] += s.wobble * sin(2 * PI * 2.1 * sec + 1)
            out[2] += s.wobble * sin(2 * PI * 0.7 * sec + 2)
        }
        val dir = unit(0.2, 0.3, 0.93)
        val kick = impulse(t, taps, freqHz = 60.0, decayMs = 15.0) { it.jolt }
        for (i in 0..2) out[i] += kick * dir[i]
        if (s.hapticAmp > 0) out[2] += vibration(t, taps, s.hapticAmp)
        return out
    }

    /** 20 ms buzz at 170 Hz with a short ring-down, starting when the keyboard vibrates. */
    private fun vibration(t: Long, taps: List<Tap>, amp: Double): Double {
        var sum = 0.0
        for (tap in taps) {
            val dtMs = (t - tap.hapticAt) / 1e6
            if (dtMs < 0 || dtMs > 45) continue
            val envelope = if (dtMs <= 20) 1.0 else exp(-(dtMs - 20) / 6)
            sum += amp * envelope * sin(2 * PI * 170 * dtMs / 1000 + 0.3)
        }
        return sum
    }

    private fun gyro(t: Long, taps: List<Tap>): DoubleArray {
        val dir = unit(0.7, 0.7, 0.14)
        val twist = impulse(t, taps, freqHz = 35.0, decayMs = 20.0) { it.twist }
        return doubleArrayOf(twist * dir[0], twist * dir[1], twist * dir[2])
    }

    /** Sum of damped sinusoids; the finger lands ~5 ms before the touch is timestamped. */
    private fun impulse(t: Long, taps: List<Tap>, freqHz: Double, decayMs: Double, amp: (Tap) -> Double): Double {
        var sum = 0.0
        for (tap in taps) {
            val dtMs = (t - (tap.t - 5 * ms)) / 1e6
            if (dtMs < 0 || dtMs > 200) continue
            sum += amp(tap) * exp(-dtMs / decayMs) * sin(2 * PI * freqHz * dtMs / 1000)
        }
        return sum
    }

    private fun unit(x: Double, y: Double, z: Double): DoubleArray {
        val n = sqrt(x * x + y * y + z * z)
        return doubleArrayOf(x / n, y / n, z / n)
    }

    private fun noisy(v: Double, sigma: Double, rnd: java.util.Random): Float = (v + rnd.nextGaussian() * sigma).toFloat()

    // ---------- tests ----------

    @Test
    fun humanTapsGiveStrongEvidence() {
        val s = run(TapMotionAnalyzer(), humanTaps(60, seed = 7))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_STRONG, s.evidence)
        assertTrue(s.toString(), s.impulseRate >= 0.9)
        assertTrue(s.toString(), s.tapsAnalyzed >= 58)
        assertTrue("jolt should peak within the tap window: $s", s.latencyMsMean in -20.0..40.0)
        assertTrue("bigger contact patch should go with bigger jolt: $s", (s.sizeJoltCorrelation ?: 0.0) > 0.5)
        assertTrue(s.toString(), s.accelPeakMean > 0.1)
        assertTrue(s.toString(), s.gyroPeakMean > 0.0)
        assertTrue(s.toString(), s.flags.isEmpty())
        assertEquals(s.toString(), 200.0, s.sampleRateHz, 1.0)
    }

    @Test
    fun injectedTapsShowNoJoltAndConstantTouchData() {
        val s = run(TapMotionAnalyzer(), injectedTaps(60, seed = 7))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_NONE, s.evidence)
        assertTrue(s.toString(), s.impulseRate <= 0.1)
        assertTrue(s.toString(), TapMotionAnalyzer.FLAG_CONSTANT_TOUCH_SIZE in s.flags)
        assertTrue(s.toString(), TapMotionAnalyzer.FLAG_CONSTANT_PRESSURE in s.flags)
        assertNull("no variation, no correlation: $s", s.sizeJoltCorrelation)
    }

    @Test
    fun tiltAndHandWobbleAreNotMistakenForTaps() {
        for (moving in listOf(
            Scenario(tiltRadPerSec = 0.05, wobble = 0.05),   // holding the phone
            Scenario(tiltRadPerSec = 0.4, wobble = 0.3)      // turning it / walking
        )) {
            val none = run(TapMotionAnalyzer(), injectedTaps(60, seed = 3), moving)
            assertTrue("tilt/wobble alone must not look like taps: $none", none.impulseRate <= 0.1)

            val real = run(TapMotionAnalyzer(), humanTaps(60, seed = 3), moving)
            assertEquals(real.toString(), TapMotionAnalyzer.EVIDENCE_STRONG, real.evidence)
        }
    }

    @Test
    fun fastTwoThumbTypingIsStillMeasured() {
        val taps = humanTaps(80, seed = 11, minGapMs = 90, maxGapMs = 140, minDwellMs = 50, maxDwellMs = 90)

        // No vibration (e.g. a phone without a vibrator): every tap can be measured.
        val quiet = run(TapMotionAnalyzer(), taps, Scenario(markHaptics = false))
        assertTrue(quiet.toString(), quiet.tapsAnalyzed >= taps.size - 1)
        assertTrue(quiet.toString(), quiet.tapsAnalyzed <= taps.size)
        assertTrue(quiet.toString(), quiet.impulseRate >= 0.7)

        // With key-up vibration at ~8 taps/s most touches land mid-buzz from the previous key.
        // Those are skipped, not scored as "no jolt", and enough remain for a verdict.
        val buzzing = run(TapMotionAnalyzer(), taps, Scenario(hapticAmp = 0.8))
        assertTrue(buzzing.toString(), buzzing.tapsAnalyzed >= TapMotionAnalyzer.MIN_TAPS_FOR_EVIDENCE)
        assertTrue(buzzing.toString(), buzzing.impulseRate >= 0.8)
        assertEquals(buzzing.toString(), TapMotionAnalyzer.EVIDENCE_STRONG, buzzing.evidence)
    }

    @Test
    fun brisk40WpmTypingWithHapticsIsMostlyMeasured() {
        val taps = humanTaps(80, seed = 12, minGapMs = 150, maxGapMs = 250, minDwellMs = 50, maxDwellMs = 90)
        val s = run(TapMotionAnalyzer(), taps, Scenario(hapticAmp = 0.8))
        assertTrue(s.toString(), s.tapsAnalyzed >= taps.size / 2)
        assertTrue(s.toString(), s.impulseRate >= 0.9)
    }

    @Test
    fun ownHapticFeedbackIsNotCountedAsAJolt() {
        val buzzing = Scenario(hapticAmp = 0.8)
        val masked = run(TapMotionAnalyzer(), injectedTaps(60, seed = 17), buzzing)
        assertTrue("injected taps + our own vibration must not look physical: $masked", masked.impulseRate <= 0.1)
        assertEquals(masked.toString(), TapMotionAnalyzer.EVIDENCE_NONE, masked.evidence)

        // Control: without onHaptic() the vibration alone would pass as a finger.
        val unmasked = run(TapMotionAnalyzer(), injectedTaps(60, seed = 17), Scenario(hapticAmp = 0.8, markHaptics = false))
        assertTrue("control should be fooled: $unmasked", unmasked.impulseRate >= 0.8)
    }

    @Test
    fun humanTapsWithHapticsStayStrong() {
        val s = run(TapMotionAnalyzer(), humanTaps(60, seed = 19), Scenario(hapticAmp = 0.8))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_STRONG, s.evidence)
        assertTrue(s.toString(), s.impulseRate >= 0.9)
    }

    @Test
    fun smallJoltsOnAQuietPhoneAreDetected() {
        // Phone lying still on a desk: little noise, small but real jolts.
        val taps = humanTaps(40, seed = 5, joltMin = 0.1, joltMax = 0.2)
        val s = run(TapMotionAnalyzer(), taps, Scenario(accelNoise = 0.004, gyroNoise = 0.0005))
        assertTrue(s.toString(), s.impulseRate >= 0.8)
    }

    @Test
    fun lowSampleRateIsUnavailable() {
        val s = run(TapMotionAnalyzer(), humanTaps(40, seed = 2), Scenario(rateHz = 50.0))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_UNAVAILABLE, s.evidence)
        assertTrue(s.toString(), TapMotionAnalyzer.FLAG_LOW_SAMPLE_RATE in s.flags)
    }

    @Test
    fun noSensorDataIsUnavailableNotBot() {
        val s = run(TapMotionAnalyzer(), humanTaps(30, seed = 4), Scenario(withSensors = false))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_UNAVAILABLE, s.evidence)
        assertEquals(s.toString(), 0, s.tapsAnalyzed)
        assertEquals(s.toString(), 30, s.tapsSeen)
        assertTrue(s.toString(), TapMotionAnalyzer.FLAG_NO_MOTION_DATA in s.flags)
    }

    @Test
    fun tooFewTapsIsUnavailable() {
        val s = run(TapMotionAnalyzer(), humanTaps(5, seed = 9))
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_UNAVAILABLE, s.evidence)
        assertEquals(s.toString(), 5, s.tapsWithImpulse)
    }

    @Test
    fun longSessionAtHighRateUsesFixedBuffer() {
        val taps = humanTaps(400, seed = 13, minGapMs = 250, maxGapMs = 350)
        val started = System.nanoTime()
        val s = run(TapMotionAnalyzer(), taps, Scenario(rateHz = 400.0))
        val elapsedMs = (System.nanoTime() - started) / 1e6
        assertTrue(s.toString(), s.tapsAnalyzed >= 398)
        assertEquals(s.toString(), TapMotionAnalyzer.EVIDENCE_STRONG, s.evidence)
        assertTrue("took $elapsedMs ms", elapsedMs < 5_000)
    }

    @Test
    fun outOfOrderSamplesAreDropped() {
        val a = TapMotionAnalyzer()
        a.addAccel(10 * ms, 0f, 0f, 9.81f)
        a.addAccel(5 * ms, 100f, 100f, 100f)   // late sample: ignored
        a.addAccel(15 * ms, 0f, 0f, 9.81f)
        assertEquals(0, a.summary().tapsSeen)
    }

    @Test
    fun liveImpulsePercentAppearsAfterAFewTaps() {
        val a = TapMotionAnalyzer()
        assertNull(a.liveImpulsePercent())
        run(a, humanTaps(20, seed = 21))
        val pct = a.liveImpulsePercent()
        assertNotNull(pct)
        assertTrue("pct=$pct", pct!! >= 90)
    }

    @Test
    fun finishSessionResetsAndMergesAcrossSessions() {
        val a = TapMotionAnalyzer()
        run(a, humanTaps(30, seed = 31))
        val first = a.finishSession()
        assertEquals(0, a.summary().tapsSeen)

        run(a, humanTaps(30, seed = 32))
        val second = a.finishSession()

        val lifetime = RunningStats()
        lifetime.merge(first.accelPeak)
        lifetime.merge(second.accelPeak)
        assertEquals(first.accelPeak.n + second.accelPeak.n, lifetime.n)
        val expectedMean = (first.accelPeak.mean * first.accelPeak.n + second.accelPeak.mean * second.accelPeak.n) / lifetime.n
        assertEquals(expectedMean, lifetime.mean, 1e-9)
    }

    @Test
    fun runningStatsMergeMatchesSinglePass() {
        val rnd = java.util.Random(99)
        val values = List(500) { rnd.nextGaussian() * 3 + 10 }
        val all = RunningStats().apply { values.forEach { add(it) } }
        val left = RunningStats().apply { values.take(123).forEach { add(it) } }
        val right = RunningStats().apply { values.drop(123).forEach { add(it) } }
        left.merge(right)
        assertEquals(all.n, left.n)
        assertEquals(all.mean, left.mean, 1e-9)
        assertEquals(all.variance, left.variance, 1e-9)
        assertEquals(all.min, left.min, 0.0)
        assertEquals(all.max, left.max, 0.0)
    }

    @Test
    fun classifyUsesTapCountAndRate() {
        assertEquals(TapMotionAnalyzer.EVIDENCE_UNAVAILABLE, TapMotionAnalyzer.classify(9, 1.0))
        assertEquals(TapMotionAnalyzer.EVIDENCE_STRONG, TapMotionAnalyzer.classify(10, 0.6))
        assertEquals(TapMotionAnalyzer.EVIDENCE_WEAK, TapMotionAnalyzer.classify(10, 0.2))
        assertEquals(TapMotionAnalyzer.EVIDENCE_NONE, TapMotionAnalyzer.classify(10, 0.19))
    }
}
