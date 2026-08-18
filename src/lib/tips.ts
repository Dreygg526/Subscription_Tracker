// Pure logic: no database, no React. One tip per day of the challenge.
//
// Everything factual here comes from the brand's own product page. Nothing is
// invented, and nothing claims to treat anything:
//
//   Directions -- "Two softgels daily with food. Most customers take them with
//   breakfast or lunch. Avoid taking on an empty stomach."
//
//   What people report -- "Week 1-2: Most people notice improved energy, better
//   sleep, and fewer cravings... Week 2-4: Brain fog starts lifting...
//   Week 4-6: Skin healing becomes visible."
//
// The rest is adherence and habit guidance, which is what a tracker is for.
// Anything stronger than this belongs on the product page, not in the app --
// and the FDA disclaimer below renders alongside it in the UI.

export const DISCLAIMER =
  'These statements have not been evaluated by the Food and Drug Administration. ' +
  'This product is not intended to diagnose, treat, cure or prevent any disease.';

export type Tip = {
  /** Human label for the stretch of the challenge this tip belongs to. */
  phase: string;
  title: string;
  body: string;
};

type Phase = {
  name: string;
  /** First day of the challenge this phase covers (1-based, inclusive). */
  from: number;
  tips: Omit<Tip, 'phase'>[];
};

/**
 * Phase boundaries follow the brand's own week-by-week copy: weeks 1-2, weeks
 * 2-4, weeks 4-6, then the long tail. Converted to days: 1-14, 15-28, 29-42,
 * 43+. A 30-day challenge simply never reaches the later phases.
 */
const PHASES: Phase[] = [
  {
    name: 'Settling in',
    from: 1,
    tips: [
      {
        title: 'Take it with food',
        body: 'Two softgels daily with food — most people take them with breakfast or lunch. Avoid an empty stomach.',
      },
      {
        title: 'Anchor it to something you already do',
        body: 'Keep the bottle next to the kettle, the coffee machine, or your toothbrush. A habit sticks to another habit far better than it sticks to good intentions.',
      },
      {
        title: 'Have a glass of water with it',
        body: 'A full glass alongside the softgels makes them easier to swallow and gets your water going for the day.',
      },
      {
        title: 'Same time every day',
        body: 'Picking one slot — breakfast or lunch — and staying in it is what turns this from a decision into a routine.',
      },
      {
        title: 'Week one is the hard one',
        body: 'The brand says most people notice better energy and sleep in the first two weeks. Getting there just means not skipping this week.',
      },
      {
        title: 'Missed yesterday? Carry on',
        body: 'Take today’s two as normal. Doubling up to catch up is not how this works, and one gap does not undo the run.',
      },
      {
        title: 'Tap the button when you take them',
        body: 'Log it in the moment rather than later. The streak is only useful if it is honest.',
      },
    ],
  },
  {
    name: 'Finding the rhythm',
    from: 15,
    tips: [
      {
        title: 'Two weeks in',
        body: 'Weeks 2-4 are when the brand says brain fog starts lifting. Keep the timing steady and let it do its thing.',
      },
      {
        title: 'Still with food',
        body: 'Same directions as day one: two softgels, with a meal, never on an empty stomach.',
      },
      {
        title: 'Notice the afternoon',
        body: 'If you are tracking anything besides the tap, make it how you feel around 3pm. That is where people tend to notice a change first.',
      },
      {
        title: 'Pack them if you travel',
        body: 'A missed day is almost always a logistics problem, not a motivation problem. Two softgels in your bag covers it.',
      },
      {
        title: 'Sleep is doing half the work',
        body: 'Better sleep is one of the things people report early. It is worth protecting the bedtime as much as the dose.',
      },
      {
        title: 'The streak is not the point',
        body: 'The point is the doses. The streak is just the easiest way to see them.',
      },
    ],
  },
  {
    name: 'Building up',
    from: 29,
    tips: [
      {
        title: 'A month in',
        body: 'Weeks 4-6 is when the brand says skin changes become visible. Slow, and easier to see in a photo than in the mirror.',
      },
      {
        title: 'Keep the meal habit',
        body: 'Two softgels with food. It is the one instruction that has not changed since day one.',
      },
      {
        title: 'Refill before you run out',
        body: 'The most common reason a run ends at week five is an empty bottle, not a change of mind. Reorder while you still have a week left.',
      },
      {
        title: 'Water still matters',
        body: 'Hydration is the cheapest thing on this list and the easiest to let slide once the routine feels automatic.',
      },
      {
        title: 'Look at the grid, not today',
        body: 'One day tells you nothing. Thirty days of squares tells you whether this is actually a habit yet.',
      },
      {
        title: 'Move a little',
        body: 'Even five minutes of walking after the meal you take them with makes the whole routine easier to keep.',
      },
    ],
  },
  {
    name: 'Staying with it',
    from: 43,
    tips: [
      {
        title: 'This is the part that counts',
        body: 'Past six weeks there is no new milestone to chase — just the same two softgels with food, and the squares filling in.',
      },
      {
        title: 'Protect the streak on hard days',
        body: 'Busy, travelling, unwell: those are the days that decide how this run ends. Take them with whatever meal you get.',
      },
      {
        title: 'Check your supply',
        body: 'Count what is left against the days still to go. Running out mid-challenge is the one failure that is entirely avoidable.',
      },
      {
        title: 'Same dose, same time',
        body: 'Two softgels daily with food. No adjusting up because you missed one, no adjusting down because you feel fine.',
      },
      {
        title: 'You are past the hard part',
        body: 'Most people who stop, stop early. If you are here, the routine is already built — you are just running it out.',
      },
      {
        title: 'Consistency beats intensity',
        body: 'Nothing about this rewards doing more on a good day. It only rewards showing up on an ordinary one.',
      },
    ],
  },
];

function phaseFor(dayNumber: number): Phase {
  let found = PHASES[0];
  for (const phase of PHASES) {
    if (dayNumber >= phase.from) found = phase;
  }
  return found;
}

/**
 * The tip for a given day of the challenge.
 *
 * Deterministic: the same day always shows the same tip, so it does not shuffle
 * under the customer on a re-render, while consecutive days differ.
 *
 * `dayNumber` is 1-based. Out-of-range values are clamped rather than throwing --
 * a bad date should never be able to blank the tracker.
 */
export function tipForDay(dayNumber: number, lengthDays: number): Tip {
  const total = Math.max(1, Math.floor(lengthDays) || 1);
  const day = Math.min(Math.max(1, Math.floor(dayNumber) || 1), total);

  if (day === 1) {
    return {
      phase: 'Day one',
      title: 'Start today, not tomorrow',
      body: 'Two softgels with your next proper meal. Then tap the button — that is the whole routine, and it does not get harder than this.',
    };
  }

  if (day === total) {
    return {
      phase: 'Final day',
      title: `Day ${total} of ${total}`,
      body: 'Last one. Take it the way you took the first, and the run is complete.',
    };
  }

  const phase = phaseFor(day);
  const tip = phase.tips[(day - 1) % phase.tips.length];

  return { phase: phase.name, ...tip };
}
