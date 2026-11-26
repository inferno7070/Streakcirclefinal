// =============================================================
// constants.js: labels and option lists used by the forms, filters and Sprint screen.
// =============================================================
// Habit categories shown as chips and in the form (key is what the server stores).
export const CAT = { health: "💚 Health", fitness: "💪 Fitness", learning: "📚 Learning", mindfulness: "🧘 Mindful", work: "💼 Work", social: "🤝 Social", finance: "💰 Finance", other: "✨ Other" };
// Units a habit target can be measured in (must match UNITS in server/src/lib.js).
export const UNITS = ["min", "hours", "times", "reps", "pages", "km", "glasses", "steps", "liters"];
// Emoji choices in the habit form icon picker.
export const ICONS = ["⭐", "💧", "📖", "🏃", "🧘", "💪", "🥗", "😴", "📝", "🎧", "💻", "🌱", "🚶", "🧠", "🎯", "💰"];
// Emoji choices for the profile avatar.
export const AVATARS = ["😀", "😎", "🦊", "🐼", "🦁", "🐯", "🐸", "🦄", "🔥", "🚀", "🌟", "🍀"];
// Sort weight for priority: high habits are listed first on the Today tab.
export const PRI = { high: 3, medium: 2, low: 1 };
// Labels for leaderboard ranking modes.
export const MET = { consistency: "Consistency", streak: "Streak", points: "Points" };
