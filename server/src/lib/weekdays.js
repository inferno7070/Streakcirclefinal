// =============================================================
// weekdays.js: weekday names and helper shared by the Insights and Circle analytics
// =============================================================
export const DOW = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
export const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// dow('2026-11-26') -> 4 (0 = Sunday)
export const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
