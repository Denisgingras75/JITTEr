package com.anvil.keyboard

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.security.MessageDigest
import java.util.Base64
import kotlin.math.sqrt

/**
 * BiometricTracker - The core of Anvil's proof-of-human-work system
 * 
 * Captures:
 * - Keystroke timing (flight time between keys)
 * - Touch pressure (where supported)
 * - Typing rhythm patterns
 * - Session statistics
 */
class BiometricTracker(context: Context) {
    
    private val prefs: SharedPreferences = context.getSharedPreferences("anvil_data", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    // Current session data
    private var sessionStartTime: Long = 0
    private var lastKeyTime: Long = 0
    private var keystrokes: Int = 0
    private var flightTimes: MutableList<Long> = mutableListOf()
    private var pressures: MutableList<Float> = mutableListOf()
    private var pastedChars: Int = 0
    
    // Lifetime passport data
    private var totalKeystrokes: Long = 0
    private var level: String = "Novice"
    
    init {
        loadPassport()
    }
    
    // ============ SESSION MANAGEMENT ============
    
    fun startSession() {
        sessionStartTime = System.currentTimeMillis()
        lastKeyTime = 0
        keystrokes = 0
        flightTimes.clear()
        pressures.clear()
        pastedChars = 0
    }
    
    fun endSession(): SessionData {
        val duration = System.currentTimeMillis() - sessionStartTime
        return SessionData(
            startTime = sessionStartTime,
            duration = duration,
            keystrokes = keystrokes,
            pastedChars = pastedChars,
            purity = calculatePurity(),
            avgFlightTime = calculateAvgFlightTime(),
            jitter = calculateJitter(),
            avgPressure = calculateAvgPressure()
        )
    }
    
    // ============ INPUT TRACKING ============
    
    fun onKeyPress(pressure: Float = 0f) {
        val now = System.currentTimeMillis()
        
        // Track flight time (time between key presses)
        if (lastKeyTime > 0) {
            val flightTime = now - lastKeyTime
            if (flightTime in 20..2000) { // Reasonable human range
                flightTimes.add(flightTime)
            }
        }
        lastKeyTime = now
        
        // Track pressure if available
        if (pressure > 0) {
            pressures.add(pressure)
        }
        
        // Increment counts
        keystrokes++
        totalKeystrokes++
        updateLevel()
        savePassport()
    }
    
    fun onPaste(charCount: Int) {
        pastedChars += charCount
    }
    
    // ============ CALCULATIONS ============
    
    fun calculatePurity(): Int {
        val total = keystrokes + pastedChars
        return if (total > 0) {
            ((keystrokes.toFloat() / total) * 100).toInt()
        } else 100
    }
    
    private fun calculateAvgFlightTime(): Double {
        return if (flightTimes.isNotEmpty()) {
            flightTimes.average()
        } else 0.0
    }
    
    private fun calculateJitter(): Double {
        if (flightTimes.size < 5) return 0.0
        
        val mean = flightTimes.average()
        val variance = flightTimes.map { (it - mean) * (it - mean) }.average()
        return sqrt(variance)
    }
    
    private fun calculateAvgPressure(): Float {
        return if (pressures.isNotEmpty()) {
            pressures.average().toFloat()
        } else 0f
    }
    
    private fun updateLevel() {
        level = when {
            totalKeystrokes >= 500000 -> "Diamond"
            totalKeystrokes >= 100000 -> "Platinum"
            totalKeystrokes >= 50000 -> "Gold"
            totalKeystrokes >= 10000 -> "Silver"
            else -> "Novice"
        }
    }
    
    // ============ BADGE GENERATION ============
    
    fun generateBadge(): BadgeData {
        val session = endSession()
        val timestamp = System.currentTimeMillis()
        
        val payload = BadgePayload(
            type = "session",
            title = "Verified Human",
            purity = session.purity,
            keystrokes = session.keystrokes,
            pasted = session.pastedChars,
            jitter = session.jitter,
            avgPressure = session.avgPressure,
            duration = session.duration,
            timestamp = timestamp,
            level = level
        )
        
        val json = gson.toJson(payload)
        val base64 = Base64.getEncoder().encodeToString(json.toByteArray())
        val hash = sha256(json)
        
        return BadgeData(
            payload = payload,
            encoded = base64,
            hash = hash
        )
    }
    
    fun generatePassportBadge(): BadgeData {
        val timestamp = System.currentTimeMillis()
        
        val payload = BadgePayload(
            type = "passport",
            title = "$level Human",
            purity = 100,
            keystrokes = totalKeystrokes.toInt(),
            pasted = 0,
            jitter = 0.0,
            avgPressure = 0f,
            duration = 0,
            timestamp = timestamp,
            level = level
        )
        
        val json = gson.toJson(payload)
        val base64 = Base64.getEncoder().encodeToString(json.toByteArray())
        val hash = sha256(json)
        
        return BadgeData(
            payload = payload,
            encoded = base64,
            hash = hash
        )
    }
    
    private fun sha256(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
    
    // ============ PERSISTENCE ============
    
    private fun savePassport() {
        prefs.edit()
            .putLong("total_keystrokes", totalKeystrokes)
            .putString("level", level)
            .apply()
    }
    
    private fun loadPassport() {
        totalKeystrokes = prefs.getLong("total_keystrokes", 0)
        level = prefs.getString("level", "Novice") ?: "Novice"
        updateLevel()
    }
    
    // ============ GETTERS ============
    
    fun getSessionKeystrokes(): Int = keystrokes
    fun getSessionPasted(): Int = pastedChars
    fun getTotalKeystrokes(): Long = totalKeystrokes
    fun getLevel(): String = level
    fun getFlightTimeCount(): Int = flightTimes.size
}

// ============ DATA CLASSES ============

data class SessionData(
    val startTime: Long,
    val duration: Long,
    val keystrokes: Int,
    val pastedChars: Int,
    val purity: Int,
    val avgFlightTime: Double,
    val jitter: Double,
    val avgPressure: Float
)

data class BadgePayload(
    val type: String,
    val title: String,
    val purity: Int,
    val keystrokes: Int,
    val pasted: Int,
    val jitter: Double,
    val avgPressure: Float,
    val duration: Long,
    val timestamp: Long,
    val level: String
)

data class BadgeData(
    val payload: BadgePayload,
    val encoded: String,
    val hash: String
)
