package com.anvil.keyboard

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.view.MotionEvent
import kotlin.math.abs

/**
 * TapMotionSensor - feeds the accelerometer and gyroscope into a
 * TapMotionAnalyzer while the keyboard is on screen
 *
 * Sensors run only between start() and stop(), i.e. while the keyboard is
 * visible, on a background thread. Nothing here is stored: samples go
 * straight into the analyzer's short in-memory buffer.
 */
class TapMotionSensor(context: Context) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager?
    private val accelerometer: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private var thread: HandlerThread? = null

    val analyzer = TapMotionAnalyzer()

    /** Begins a new session, switching the sensors on if they aren't already. */
    fun start() {
        analyzer.resetSession()
        val manager = sensorManager ?: return
        val accel = accelerometer ?: return
        if (thread != null) return

        val sensorThread = HandlerThread("anvil-motion").apply { start() }
        val handler = Handler(sensorThread.looper)
        manager.registerListener(this, accel, SensorManager.SENSOR_DELAY_FASTEST, handler)
        gyroscope?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST, handler) }
        thread = sensorThread
    }

    /** Ends the current session but keeps the sensors running. */
    fun finishSession(): MotionSessionResult = analyzer.finishSession()

    /** Ends the session and switches the sensors off. Safe to call more than once. */
    fun stop(): MotionSessionResult {
        val result = analyzer.finishSession()
        sensorManager?.unregisterListener(this)
        thread?.quitSafely()
        thread = null
        analyzer.clearSamples()
        return result
    }

    /** Call on every ACTION_DOWN on a key. */
    fun onTouchDown(event: MotionEvent) {
        // Touch events are stamped with uptimeMillis; sensor events with elapsedRealtimeNanos.
        val offsetNanos = SystemClock.elapsedRealtimeNanos() - SystemClock.uptimeMillis() * NANOS_PER_MS
        analyzer.onTouchDown(event.eventTime * NANOS_PER_MS + offsetNanos, event.touchMajor, event.pressure)
    }

    /** Call whenever the keyboard vibrates, so the analyzer ignores our own shake. */
    fun onHaptic() {
        analyzer.onHaptic(SystemClock.elapsedRealtimeNanos())
    }

    override fun onSensorChanged(event: SensorEvent) {
        val now = SystemClock.elapsedRealtimeNanos()
        // Some older devices stamp sensor events on a different clock; fall back to arrival time.
        val t = if (abs(now - event.timestamp) < MAX_CLOCK_SKEW_NANOS) event.timestamp else now
        val v = event.values
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> analyzer.addAccel(t, v[0], v[1], v[2])
            Sensor.TYPE_GYROSCOPE -> analyzer.addGyro(t, v[0], v[1], v[2])
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        private const val NANOS_PER_MS = 1_000_000L
        private const val MAX_CLOCK_SKEW_NANOS = 1_000_000_000L
    }
}
