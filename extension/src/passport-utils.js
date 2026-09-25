// passport-utils.js - The local passport: how long this device has been used
// and how much was typed on it. Dates and counts only; never text.
//
// Fields: firstUsed, lastUsed (ms timestamps), totalKeystrokes,
// sessionsCompleted, level, dailyStats ({ 'YYYY-MM-DD': keys }, last 90 days),
// sessionHistory ({ lengths: [], timestamps: [] }, last 100 sessions).
//
// Callers (content.js, writer.js) bump totalKeystrokes / sessionsCompleted
// themselves and call updatePassport(passport, keys, isSessionEnd).

const PassportUtils = {
    DAILY_STATS_DAYS: 90,
    SESSION_HISTORY_MAX: 100,

    // Level thresholds by total keystrokes on this device.
    LEVELS: [
        [1000, 'Novice'],
        [5000, 'Beginner'],
        [15000, 'Intermediate'],
        [50000, 'Advanced'],
        [150000, 'Expert'],
    ],
    TOP_LEVEL: 'Master',

    // Fields earlier versions derived from the schedule (hour-of-day pattern,
    // night-hours ratio, a "suspicion" score and its signals) and the averages
    // that fed them. They judged people by when they typed and were wrong more
    // often than right, so they are gone; stored passports are cleaned on update.
    LEGACY_FIELDS: [
        'hourlyPattern', 'suspicionScore', 'suspicionSignals',
        'avgDailyKeys', 'dailyVariance',
        'avgSessionLength', 'longestSession', 'sessionLengthVariance',
    ],

    level(totalKeystrokes) {
        const k = Number(totalKeystrokes) || 0;
        for (const [max, name] of this.LEVELS) {
            if (k < max) return name;
        }
        return this.TOP_LEVEL;
    },

    // Add keystrokes to today's count
    updateDailyStats(passport, keystrokeCount) {
        const count = Number(keystrokeCount);
        if (!passport.dailyStats || typeof passport.dailyStats !== 'object') passport.dailyStats = {};
        if (!(count > 0) || !isFinite(count)) return passport;

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        passport.dailyStats[today] = (passport.dailyStats[today] || 0) + count;
        this.cleanOldStats(passport.dailyStats, this.DAILY_STATS_DAYS);
        return passport;
    },

    // Record a finished session's length
    recordSession(passport, sessionKeys) {
        if (!passport.sessionHistory || !Array.isArray(passport.sessionHistory.lengths)) {
            passport.sessionHistory = { lengths: [], timestamps: [] };
        }
        passport.sessionHistory.lengths.push(sessionKeys);
        passport.sessionHistory.timestamps.push(Date.now());

        while (passport.sessionHistory.lengths.length > this.SESSION_HISTORY_MAX) {
            passport.sessionHistory.lengths.shift();
            passport.sessionHistory.timestamps.shift();
        }
        return passport;
    },

    // Keep only the most recent maxDays days
    cleanOldStats(dailyStats, maxDays) {
        const dates = Object.keys(dailyStats).sort();
        if (dates.length > maxDays) {
            const toDelete = dates.slice(0, dates.length - maxDays);
            toDelete.forEach(date => delete dailyStats[date]);
        }
    },

    stripLegacyFields(passport) {
        for (const field of this.LEGACY_FIELDS) delete passport[field];
        return passport;
    },

    // Full passport update. Call it on each keystroke with keystrokeCount = 1
    // (added to today's count) and once at session end with keystrokeCount =
    // the session's keys and isSessionEnd = true (recorded as a session; not
    // added to the daily count again, those keys were counted one by one).
    updatePassport(passport, keystrokeCount = 1, isSessionEnd = false) {
        if (!passport.firstUsed) passport.firstUsed = Date.now();
        passport.lastUsed = Date.now();
        if (typeof passport.totalKeystrokes !== 'number') passport.totalKeystrokes = 0;
        if (typeof passport.sessionsCompleted !== 'number') passport.sessionsCompleted = 0;

        if (isSessionEnd) {
            if (keystrokeCount > 0) this.recordSession(passport, keystrokeCount);
        } else {
            this.updateDailyStats(passport, keystrokeCount);
        }
        passport.level = this.level(passport.totalKeystrokes);
        this.stripLegacyFields(passport);
        return passport;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PassportUtils;
}
