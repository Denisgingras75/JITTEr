package com.anvil.keyboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import android.util.TypedValue
import android.graphics.drawable.GradientDrawable

/**
 * MainActivity - Dashboard for Anvil Keyboard
 * 
 * Shows:
 * - Setup instructions
 * - Lifetime stats (passport)
 * - Badge generation
 */
class MainActivity : AppCompatActivity() {
    
    private lateinit var tracker: BiometricTracker
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        tracker = BiometricTracker(this)
        
        val mainLayout = createMainLayout()
        setContentView(mainLayout)
    }
    
    override fun onResume() {
        super.onResume()
        // Refresh UI when returning to app
        setContentView(createMainLayout())
    }
    
    private fun createMainLayout(): ScrollView {
        return ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#111111"))
            
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(24), dp(48), dp(24), dp(48))
                
                // Header
                addView(createHeader())
                
                // Setup Card (if not enabled)
                if (!isKeyboardEnabled()) {
                    addView(createSetupCard())
                }
                
                // Stats Card
                addView(createStatsCard())
                
                // Badge Card
                addView(createBadgeCard())
                
                // Info Card
                addView(createInfoCard())
            })
        }
    }
    
    private fun createHeader(): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, dp(32))
            
            // Shield icon
            addView(TextView(context).apply {
                text = "🛡️"
                textSize = 64f
                gravity = Gravity.CENTER
            })
            
            // Title
            addView(TextView(context).apply {
                text = "ANVIL KEYBOARD"
                setTextColor(Color.WHITE)
                textSize = 24f
                gravity = Gravity.CENTER
                setTypeface(null, android.graphics.Typeface.BOLD)
                letterSpacing = 0.1f
            })
            
            // Subtitle
            addView(TextView(context).apply {
                text = "Proof of Human Work"
                setTextColor(Color.parseColor("#00BA7C"))
                textSize = 14f
                gravity = Gravity.CENTER
                setPadding(0, dp(8), 0, 0)
            })
        }
    }
    
    private fun createSetupCard(): LinearLayout {
        return createCard("⚠️ SETUP REQUIRED", Color.parseColor("#FFD700")).apply {
            
            addView(TextView(context).apply {
                text = "Enable Anvil Keyboard to start tracking your authentic typing."
                setTextColor(Color.parseColor("#aaaaaa"))
                textSize = 14f
                setPadding(0, 0, 0, dp(16))
            })
            
            // Enable button
            addView(createButton("Enable Keyboard", Color.parseColor("#FFD700"), Color.BLACK) {
                startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
            })
            
            // Select button
            addView(createButton("Select Anvil Keyboard", Color.parseColor("#333333"), Color.WHITE) {
                val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.showInputMethodPicker()
            })
        }
    }
    
    private fun createStatsCard(): LinearLayout {
        return createCard("📊 YOUR PASSPORT", Color.parseColor("#00BA7C")).apply {
            
            // Level
            addView(createStatRow("Rank", tracker.getLevel(), Color.parseColor("#FFD700")))
            
            // Total keystrokes
            addView(createStatRow("Lifetime Keystrokes", formatNumber(tracker.getTotalKeystrokes())))
            
            // Level progress
            val (current, next, progress) = getLevelProgress()
            addView(createProgressBar(progress, current, next))
        }
    }
    
    private fun createBadgeCard(): LinearLayout {
        return createCard("🏷️ COPY BADGE", Color.parseColor("#00BA7C")).apply {
            
            addView(TextView(context).apply {
                text = "Generate a verifiable badge to prove your human authorship."
                setTextColor(Color.parseColor("#aaaaaa"))
                textSize = 14f
                setPadding(0, 0, 0, dp(16))
            })
            
            addView(createButton("Copy Passport Badge", Color.parseColor("#00BA7C"), Color.BLACK) {
                copyPassportBadge()
            })
        }
    }
    
    private fun createInfoCard(): LinearLayout {
        return createCard("ℹ️ HOW IT WORKS", Color.parseColor("#666666")).apply {
            
            val steps = listOf(
                "1. Type using Anvil Keyboard",
                "2. Every keystroke is tracked with timing & pressure",
                "3. Pasting is logged separately",
                "4. Your purity score = typed / (typed + pasted)",
                "5. Badges prove your work is human-made"
            )
            
            steps.forEach { step ->
                addView(TextView(context).apply {
                    text = step
                    setTextColor(Color.parseColor("#888888"))
                    textSize = 13f
                    setPadding(0, dp(4), 0, dp(4))
                })
            }
        }
    }
    
    // ============ HELPERS ============
    
    private fun createCard(title: String, accentColor: Int): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1a1a1a"))
                cornerRadius = dp(16).toFloat()
                setStroke(1, Color.parseColor("#333333"))
            }
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, 0, 0, dp(16))
            layoutParams = params
            
            // Title
            addView(TextView(context).apply {
                text = title
                setTextColor(accentColor)
                textSize = 14f
                setTypeface(null, android.graphics.Typeface.BOLD)
                letterSpacing = 0.05f
                setPadding(0, 0, 0, dp(16))
            })
        }
    }
    
    private fun createStatRow(label: String, value: String, valueColor: Int = Color.WHITE): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(8), 0, dp(8))
            
            addView(TextView(context).apply {
                text = label
                setTextColor(Color.parseColor("#888888"))
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            
            addView(TextView(context).apply {
                text = value
                setTextColor(valueColor)
                textSize = 14f
                setTypeface(null, android.graphics.Typeface.BOLD)
            })
        }
    }
    
    private fun createProgressBar(progress: Float, currentLevel: String, nextLevel: String): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(12), 0, 0)
            
            // Progress bar
            addView(FrameLayout(context).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(8)
                )
                
                // Background
                addView(View(context).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#333333"))
                        cornerRadius = dp(4).toFloat()
                    }
                })
                
                // Progress
                addView(View(context).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        0,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    ).apply {
                        width = (resources.displayMetrics.widthPixels * progress * 0.8).toInt()
                    }
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#00BA7C"))
                        cornerRadius = dp(4).toFloat()
                    }
                })
            })
            
            // Labels
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, 0)
                
                addView(TextView(context).apply {
                    text = currentLevel
                    setTextColor(Color.parseColor("#666666"))
                    textSize = 11f
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                
                addView(TextView(context).apply {
                    text = nextLevel
                    setTextColor(Color.parseColor("#666666"))
                    textSize = 11f
                })
            })
        }
    }
    
    private fun createButton(text: String, bgColor: Int, textColor: Int, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            this.text = text
            setTextColor(textColor)
            textSize = 14f
            setTypeface(null, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(14), dp(16), dp(14))
            
            background = GradientDrawable().apply {
                setColor(bgColor)
                cornerRadius = dp(8).toFloat()
            }
            
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.setMargins(0, dp(8), 0, 0)
            layoutParams = params
            
            setOnClickListener { onClick() }
        }
    }
    
    private fun isKeyboardEnabled(): Boolean {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        val enabledMethods = imm.enabledInputMethodList
        return enabledMethods.any { it.packageName == packageName }
    }
    
    private fun getLevelProgress(): Triple<String, String, Float> {
        val keystrokes = tracker.getTotalKeystrokes()
        return when {
            keystrokes >= 500000 -> Triple("Diamond", "Max", 1f)
            keystrokes >= 100000 -> Triple("Platinum", "Diamond", (keystrokes - 100000f) / 400000f)
            keystrokes >= 50000 -> Triple("Gold", "Platinum", (keystrokes - 50000f) / 50000f)
            keystrokes >= 10000 -> Triple("Silver", "Gold", (keystrokes - 10000f) / 40000f)
            else -> Triple("Novice", "Silver", keystrokes / 10000f)
        }
    }
    
    private fun formatNumber(num: Long): String {
        return when {
            num >= 1000000 -> String.format("%.1fM", num / 1000000.0)
            num >= 1000 -> String.format("%.1fK", num / 1000.0)
            else -> num.toString()
        }
    }
    
    private fun copyPassportBadge() {
        val badge = tracker.generatePassportBadge()
        val level = tracker.getLevel()
        val keystrokes = tracker.getTotalKeystrokes()
        
        val html = """
            <span data-anvil-verify="${badge.encoded}" title="Anvil Passport | $level | ${formatNumber(keystrokes)} keystrokes" style="display: inline-block; background-color: rgba(255, 215, 0, 0.15); color: #FFD700; padding: 5px 14px; border-radius: 50px; font-family: sans-serif; font-weight: 600; border: 1.5px solid #FFD700; font-size: 12px;">👤 $level Human</span>
        """.trimIndent()
        
        val plain = "[ 👤 $level Human | ${formatNumber(keystrokes)} keystrokes ]"
        
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newHtmlText("Anvil Badge", plain, html)
        clipboard.setPrimaryClip(clip)
        
        Toast.makeText(this, "✅ Badge copied!", Toast.LENGTH_SHORT).show()
    }
    
    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }
}
