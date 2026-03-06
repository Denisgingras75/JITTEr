package com.anvil.keyboard

import android.inputmethodservice.InputMethodService
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.LinearLayout
import android.widget.TextView
import android.view.MotionEvent
import android.view.Gravity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.content.Context
import android.widget.FrameLayout
import android.widget.ImageView
import android.util.TypedValue

/**
 * AnvilInputMethodService - The main keyboard implementation
 * 
 * Features:
 * - Full QWERTY keyboard
 * - Biometric tracking on every keypress
 * - Real-time purity display
 * - Touch pressure capture
 */
class AnvilInputMethodService : InputMethodService() {
    
    private lateinit var tracker: BiometricTracker
    private lateinit var keyboardView: LinearLayout
    private lateinit var statusBar: LinearLayout
    private lateinit var purityText: TextView
    private lateinit var keystrokeText: TextView
    
    private var isShiftOn = false
    private var isCapsLock = false
    
    private val ROW_1 = listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p")
    private val ROW_2 = listOf("a", "s", "d", "f", "g", "h", "j", "k", "l")
    private val ROW_3 = listOf("z", "x", "c", "v", "b", "n", "m")
    
    override fun onCreate() {
        super.onCreate()
        tracker = BiometricTracker(this)
    }
    
    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        tracker.startSession()
        updateStatusBar()
    }
    
    override fun onCreateInputView(): View {
        keyboardView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#1a1a1a"))
            setPadding(4, 4, 4, 8)
        }
        
        // Status bar at top
        statusBar = createStatusBar()
        keyboardView.addView(statusBar)
        
        // Keyboard rows
        keyboardView.addView(createRow(ROW_1))
        keyboardView.addView(createRow(ROW_2, addPadding = true))
        keyboardView.addView(createShiftRow())
        keyboardView.addView(createBottomRow())
        
        return keyboardView
    }
    
    private fun createStatusBar(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(16, 8, 16, 8)
            setBackgroundColor(Color.parseColor("#111111"))
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(36)
            )
            params.setMargins(0, 0, 0, 4)
            layoutParams = params
            
            // Shield icon
            val shield = TextView(context).apply {
                text = "🛡️"
                textSize = 16f
            }
            addView(shield)
            
            // Anvil label
            val label = TextView(context).apply {
                text = " ANVIL "
                setTextColor(Color.parseColor("#00BA7C"))
                textSize = 12f
                setTypeface(null, android.graphics.Typeface.BOLD)
            }
            addView(label)
            
            // Spacer
            val spacer = View(context).apply {
                layoutParams = LinearLayout.LayoutParams(0, 1, 1f)
            }
            addView(spacer)
            
            // Keystroke count
            keystrokeText = TextView(context).apply {
                text = "0"
                setTextColor(Color.WHITE)
                textSize = 12f
            }
            addView(keystrokeText)
            
            val typedLabel = TextView(context).apply {
                text = " typed  "
                setTextColor(Color.parseColor("#666666"))
                textSize = 12f
            }
            addView(typedLabel)
            
            // Purity display
            purityText = TextView(context).apply {
                text = "100%"
                setTextColor(Color.parseColor("#00BA7C"))
                textSize = 12f
                setTypeface(null, android.graphics.Typeface.BOLD)
            }
            addView(purityText)
        }
    }
    
    private fun createRow(keys: List<String>, addPadding: Boolean = false): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
            )
            params.setMargins(if (addPadding) dp(16) else 0, 2, if (addPadding) dp(16) else 0, 2)
            layoutParams = params
            
            keys.forEach { key ->
                addView(createKey(key))
            }
        }
    }
    
    private fun createShiftRow(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
            )
            params.setMargins(0, 2, 0, 2)
            layoutParams = params
            
            // Shift key
            addView(createSpecialKey("⇧", 1.4f) {
                if (isShiftOn && !isCapsLock) {
                    isCapsLock = true
                } else if (isCapsLock) {
                    isShiftOn = false
                    isCapsLock = false
                } else {
                    isShiftOn = true
                }
                refreshKeyboard()
            })
            
            // Letter keys
            ROW_3.forEach { key ->
                addView(createKey(key))
            }
            
            // Backspace
            addView(createSpecialKey("⌫", 1.4f) {
                currentInputConnection?.deleteSurroundingText(1, 0)
                vibrate()
            })
        }
    }
    
    private fun createBottomRow(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(52)
            )
            params.setMargins(0, 2, 0, 2)
            layoutParams = params
            
            // Numbers key
            addView(createSpecialKey("123", 1.2f) {
                // TODO: Switch to numbers layout
            })
            
            // Comma
            addView(createKey(",", 0.8f))
            
            // Space bar
            addView(createSpaceBar())
            
            // Period
            addView(createKey(".", 0.8f))
            
            // Enter
            addView(createSpecialKey("↵", 1.2f) {
                currentInputConnection?.commitText("\n", 1)
                tracker.onKeyPress()
                updateStatusBar()
                vibrate()
            })
        }
    }
    
    private fun createKey(char: String, weight: Float = 1f): TextView {
        return TextView(this).apply {
            val displayChar = if (isShiftOn || isCapsLock) char.uppercase() else char
            text = displayChar
            textSize = 20f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            
            val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, weight)
            params.setMargins(3, 0, 3, 0)
            layoutParams = params
            
            background = createKeyBackground()
            
            setOnTouchListener { v, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        v.isPressed = true
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        v.isPressed = false
                        val pressure = event.pressure
                        val outputChar = if (isShiftOn || isCapsLock) char.uppercase() else char
                        currentInputConnection?.commitText(outputChar, 1)
                        tracker.onKeyPress(pressure)
                        
                        // Reset shift after typing (unless caps lock)
                        if (isShiftOn && !isCapsLock) {
                            isShiftOn = false
                            refreshKeyboard()
                        }
                        
                        updateStatusBar()
                        vibrate()
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        v.isPressed = false
                        true
                    }
                    else -> false
                }
            }
        }
    }
    
    private fun createSpecialKey(label: String, weight: Float, action: () -> Unit): TextView {
        return TextView(this).apply {
            text = label
            textSize = 16f
            setTextColor(Color.parseColor("#aaaaaa"))
            gravity = Gravity.CENTER
            
            val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, weight)
            params.setMargins(3, 0, 3, 0)
            layoutParams = params
            
            background = createKeyBackground(Color.parseColor("#222222"))
            
            setOnTouchListener { v, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        v.isPressed = true
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        v.isPressed = false
                        action()
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        v.isPressed = false
                        true
                    }
                    else -> false
                }
            }
        }
    }
    
    private fun createSpaceBar(): TextView {
        return TextView(this).apply {
            text = "ANVIL"
            textSize = 12f
            setTextColor(Color.parseColor("#666666"))
            gravity = Gravity.CENTER
            setTypeface(null, android.graphics.Typeface.BOLD)
            letterSpacing = 0.3f
            
            val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 4f)
            params.setMargins(3, 0, 3, 0)
            layoutParams = params
            
            background = createKeyBackground(Color.parseColor("#333333"))
            
            setOnTouchListener { v, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        v.isPressed = true
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        v.isPressed = false
                        currentInputConnection?.commitText(" ", 1)
                        tracker.onKeyPress(event.pressure)
                        updateStatusBar()
                        vibrate()
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        v.isPressed = false
                        true
                    }
                    else -> false
                }
            }
        }
    }
    
    private fun createKeyBackground(color: Int = Color.parseColor("#2d2d2d")): GradientDrawable {
        return GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(8).toFloat()
        }
    }
    
    private fun refreshKeyboard() {
        // Recreate the keyboard view to reflect shift state
        keyboardView.removeAllViews()
        keyboardView.addView(createStatusBar())
        keyboardView.addView(createRow(ROW_1))
        keyboardView.addView(createRow(ROW_2, addPadding = true))
        keyboardView.addView(createShiftRow())
        keyboardView.addView(createBottomRow())
        updateStatusBar()
    }
    
    private fun updateStatusBar() {
        keystrokeText.text = tracker.getSessionKeystrokes().toString()
        val purity = tracker.calculatePurity()
        purityText.text = "$purity%"
        purityText.setTextColor(
            if (purity >= 80) Color.parseColor("#00BA7C")
            else Color.parseColor("#FF4444")
        )
    }
    
    private fun vibrate() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(20)
        }
    }
    
    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }
}
