// =============================================================
// ai-tools.js: the actions Tick is allowed to run, with strict input validation
// so a bad AI answer can never write invalid data.
// =============================================================
export const tools = [
  { name: 'mark_complete', description: "Mark one of the authenticated user's habits fully done today.", parameters: { type: 'object', properties: { habit: { type: 'string', minLength: 1, maxLength: 40 } }, required: ['habit'], additionalProperties: false } },
  { name: 'log_progress', description: "Set today's progress for one of the authenticated user's habits.", parameters: { type: 'object', properties: { habit: { type: 'string', minLength: 1, maxLength: 40 }, value: { type: 'number', minimum: 0, maximum: 100000 } }, required: ['habit', 'value'], additionalProperties: false } },
  { name: 'lower_target', description: "Reduce one of the authenticated user's habit targets to make it easier to maintain.", parameters: { type: 'object', properties: { habit: { type: 'string', minLength: 1, maxLength: 40 } }, required: ['habit'], additionalProperties: false } },
  { name: 'add_habit', description: 'Create a habit for the authenticated user.', parameters: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, target: { type: 'number', minimum: 1, maximum: 100000 }, unit: { type: 'string', enum: ['min', 'hours', 'times', 'reps', 'pages', 'km', 'glasses', 'steps', 'liters'] } }, required: ['name', 'target', 'unit'], additionalProperties: false } },
  { name: 'nudge', description: 'Send a real-time nudge to a member of the authenticated user\'s current circle by exact name.', parameters: { type: 'object', properties: { member: { type: 'string', minLength: 1, maxLength: 40 }, emoji: { type: 'string', enum: ['👋', '👏', '🔥'] } }, required: ['member'], additionalProperties: false } },
].map((tool) => ({ type: 'function', function: tool }));

const TOOL_NAMES = new Set(tools.map((t) => t.function.name));

export function validateToolInput(name, input) {
  if (!TOOL_NAMES.has(name)) throw new Error('Unsupported action');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid action arguments');
  const allowed = {
    mark_complete: ['habit'], log_progress: ['habit', 'value'], lower_target: ['habit'],
    add_habit: ['name', 'target', 'unit'], nudge: ['member', 'emoji'],
  }[name];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Unexpected action argument');
  if (['mark_complete', 'log_progress', 'lower_target'].includes(name) && (typeof input.habit !== 'string' || !input.habit.trim() || input.habit.length > 40)) throw new Error('Choose a valid habit name');
  if (name === 'log_progress' && (!Number.isFinite(input.value) || input.value < 0 || input.value > 100000)) throw new Error('Progress must be a valid number');
  if (name === 'add_habit') {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 40) throw new Error('Enter a valid habit name');
    if (!Number.isFinite(input.target) || input.target < 1 || input.target > 100000) throw new Error('Target must be between 1 and 100000');
    if (!['min', 'hours', 'times', 'reps', 'pages', 'km', 'glasses', 'steps', 'liters'].includes(input.unit)) throw new Error('Choose a supported habit unit');
  }
  if (name === 'nudge') {
    if (typeof input.member !== 'string' || !input.member.trim() || input.member.length > 40) throw new Error('Choose a valid circle member');
    if (input.emoji !== undefined && !['👋', '👏', '🔥'].includes(input.emoji)) throw new Error('Choose a supported nudge');
  }
  return input;
}

