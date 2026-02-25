// passport-utils.js - Activity pattern tracking and bot detection

const PassportUtils = {
    // Update daily statistics
    updateDailyStats(passport, keystrokeCount) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        if (!passport.dailyStats) passport.dailyStats = {};
        if (!passport.dailyStats[today]) {
            passport.dailyStats[today] = 0;
        }

        passport.dailyStats[today] += keystrokeCount;

        // Keep only last 90 days
        this.cleanOldStats(passport.dailyStats, 90);

        return passport;
    },

    // Update hourly pattern
    updateHourlyPattern(passport) {
        const hour = new Date().getHours(); // 0-23

        if (!passport.hourlyPattern) {
            passport.hourlyPattern = new Array(24).fill(0);
        }

        passport.hourlyPattern[hour]++;

        return passport;
    },

    // Track session statistics
    recordSession(passport, sessionKeys) {
        if (!passport.sessionHistory) {
            passport.sessionHistory = {
                lengths: [],
                timestamps: []
            };
        }

        passport.sessionHistory.lengths.push(sessionKeys);
        passport.sessionHistory.timestamps.push(Date.now());

        // Keep last 100 sessions
        if (passport.sessionHistory.lengths.length > 100) {
            passport.sessionHistory.lengths.shift();
            passport.sessionHistory.timestamps.shift();
        }

        // Update averages
        this.calculateSessionAverages(passport);

        return passport;
    },

    // Calculate session statistics
    calculateSessionAverages(passport) {
        if (!passport.sessionHistory || passport.sessionHistory.lengths.length === 0) {
            passport.avgSessionLength = 0;
            passport.longestSession = 0;
            passport.sessionLengthVariance = 0;
            return passport;
        }

        const lengths = passport.sessionHistory.lengths;

        // Average
        const sum = lengths.reduce((a, b) => a + b, 0);
        passport.avgSessionLength = Math.round(sum / lengths.length);

        // Longest
        passport.longestSession = Math.max(...lengths);

        // Variance (coefficient of variation)
        const avg = passport.avgSessionLength;
        if (avg > 0) {
            const squareDiffs = lengths.map(len => Math.pow(len - avg, 2));
            const variance = squareDiffs.reduce((a, b) => a + b, 0) / lengths.length;
            const stdDev = Math.sqrt(variance);
            passport.sessionLengthVariance = parseFloat((stdDev / avg).toFixed(2));
        } else {
            passport.sessionLengthVariance = 0;
        }

        return passport;
    },

    // Calculate daily statistics
    calculateDailyAverages(passport) {
        if (!passport.dailyStats || Object.keys(passport.dailyStats).length === 0) {
            passport.avgDailyKeys = 0;
            passport.dailyVariance = 0;
            return passport;
        }

        const values = Object.values(passport.dailyStats);

        // Average
        const sum = values.reduce((a, b) => a + b, 0);
        passport.avgDailyKeys = Math.round(sum / values.length);

        // Variance
        const avg = passport.avgDailyKeys;
        if (avg > 0) {
            const squareDiffs = values.map(val => Math.pow(val - avg, 2));
            const variance = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
            const stdDev = Math.sqrt(variance);
            passport.dailyVariance = parseFloat((stdDev / avg).toFixed(2));
        } else {
            passport.dailyVariance = 0;
        }

        return passport;
    },

    // Calculate night activity percentage (2am-6am)
    getNightActivityPercent(passport) {
        if (!passport.hourlyPattern) return 0;

        const nightHours = passport.hourlyPattern.slice(2, 6); // 2am-6am
        const totalNight = nightHours.reduce((a, b) => a + b, 0);
        const totalAll = passport.hourlyPattern.reduce((a, b) => a + b, 0);

        if (totalAll === 0) return 0;

        return Math.round((totalNight / totalAll) * 100);
    },

    // Calculate suspicion score (0-100, higher = more suspicious)
    calculateSuspicionScore(passport) {
        let score = 0;
        const signals = [];

        // Signal 1: Superhuman daily output
        if (passport.avgDailyKeys > 5000) {
            score += 30;
            signals.push('High daily output');
        } else if (passport.avgDailyKeys > 3000) {
            score += 15;
            signals.push('Elevated daily output');
        }

        // Signal 2: Too consistent (low variance)
        if (passport.dailyVariance < 0.3 && passport.avgDailyKeys > 500) {
            score += 25;
            signals.push('Unnaturally consistent');
        }

        // Signal 3: Too many sessions per day
        const accountAgeDays = passport.firstUsed ?
            Math.max(1, Math.floor((Date.now() - passport.firstUsed) / (1000 * 60 * 60 * 24))) : 1;
        const sessionsPerDay = passport.sessionsCompleted / accountAgeDays;

        if (sessionsPerDay > 10) {
            score += 25;
            signals.push('Excessive sessions/day');
        } else if (sessionsPerDay > 5) {
            score += 10;
            signals.push('High sessions/day');
        }

        // Signal 4: Extensive night activity (2am-6am)
        const nightPercent = this.getNightActivityPercent(passport);
        if (nightPercent > 40) {
            score += 15;
            signals.push('High night activity');
        }

        // Signal 5: New account with high output
        if (accountAgeDays < 7 && passport.totalKeystrokes > 10000) {
            score += 20;
            signals.push('New account, high output');
        }

        // Signal 6: Extremely long sessions (10K+ keys)
        if (passport.longestSession > 10000) {
            score += 15;
            signals.push('Extremely long session');
        }

        // Signal 7: Analog depth anomalies (if Wooting data available)
        if (passport.analogStats) {
            // Unnaturally flat depth — every key pressed to exact same depth
            if (passport.analogStats.depthStdDev < 0.03 && passport.analogStats.sampleCount >= 20) {
                score += 25;
                signals.push('Uniform analog depth (mechanical)');
            }
            // No per-finger variation — real humans press harder with index vs pinky
            if (passport.analogStats.regionVariance < 0.02 && passport.analogStats.sampleCount >= 30) {
                score += 15;
                signals.push('No finger-pressure variation');
            }
            // Analog depth confidence bonus: natural depth reduces suspicion
            if (passport.analogStats.depthStdDev >= 0.05 && passport.analogStats.regionVariance >= 0.03) {
                score = Math.max(0, score - 10);
            }
        }

        passport.suspicionScore = Math.min(100, score);
        passport.suspicionSignals = signals;

        return passport;
    },

    // Clean old daily stats
    cleanOldStats(dailyStats, maxDays) {
        const dates = Object.keys(dailyStats).sort();
        if (dates.length > maxDays) {
            const toDelete = dates.slice(0, dates.length - maxDays);
            toDelete.forEach(date => delete dailyStats[date]);
        }
    },

    // Get human-readable risk level
    getRiskLevel(suspicionScore) {
        if (suspicionScore >= 70) return { level: 'HIGH', color: '#FF0000', emoji: '🚨' };
        if (suspicionScore >= 40) return { level: 'MEDIUM', color: '#FFD700', emoji: '⚠️' };
        return { level: 'LOW', color: '#00F0FF', emoji: '✅' };
    },

    // Update analog depth statistics from Wooting data
    updateAnalogStats(passport, depthStats) {
        if (!depthStats) return passport;

        passport.analogStats = {
            avgDepth: depthStats.avgDepth,
            depthStdDev: depthStats.depthStdDev,
            depthRange: depthStats.depthRange,
            bottomOutRate: depthStats.bottomOutRate,
            lightTouchRate: depthStats.lightTouchRate,
            regionVariance: depthStats.regionVariance,
            sampleCount: depthStats.sampleCount
        };

        return passport;
    },

    // Full passport update (call this on each keystroke or session end)
    updatePassport(passport, keystrokeCount = 1, isSessionEnd = false) {
        // Update daily stats
        this.updateDailyStats(passport, keystrokeCount);

        // Update hourly pattern
        this.updateHourlyPattern(passport);

        // If session ending, record it
        if (isSessionEnd && keystrokeCount > 0) {
            this.recordSession(passport, keystrokeCount);
        }

        // Update analog depth stats if Wooting is available
        if (typeof WootingAnalog !== 'undefined' && WootingAnalog.isAvailable()) {
            this.updateAnalogStats(passport, WootingAnalog.getDepthStats());
        }

        // Recalculate statistics
        this.calculateDailyAverages(passport);
        this.calculateSuspicionScore(passport);

        return passport;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PassportUtils;
}
