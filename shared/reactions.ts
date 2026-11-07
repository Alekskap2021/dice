export type Reaction = { id: string; emoji?: string; text?: string };

/** Быстрые реакции: шесть эмодзи и четыре короткие реплики. */
export const REACTIONS = [
  { id: 'like', emoji: '👍' },
  { id: 'laugh', emoji: '😂' },
  { id: 'wow', emoji: '😮' },
  { id: 'angry', emoji: '😡' },
  { id: 'dice', emoji: '🎲' },
  { id: 'beer', emoji: '🍺' },
  { id: 'luck', text: 'Удачи!' },
  { id: 'go', text: 'Ну давай!' },
  { id: 'unlucky', text: 'Не повезло' },
  { id: 'nice', text: 'Красиво!' },
] as const satisfies readonly Reaction[];

export type ReactionId = (typeof REACTIONS)[number]['id'];

export const isReactionId = (value: unknown): value is ReactionId => REACTIONS.some((reaction) => reaction.id === value);

export const reactionById = (id: ReactionId): Reaction => REACTIONS.find((reaction) => reaction.id === id) ?? REACTIONS[0];
