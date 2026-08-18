'use client';

import { useEffect, useState, useTransition } from 'react';
import { checkIn, setTimezone } from '@/app/actions';
import { addDays, computeProgress, computeStreak, daysBetween } from '@/lib/challenge';
import { tipForDay } from '@/lib/tips';

type Props = {
  today: string;
  timezone: string;
  startedOn: string;
  lengthDays: number;
  offerLabel: string | null;
  initialCheckIns: string[];
  productName: string;
};

export default function Tracker({
  today,
  timezone,
  startedOn,
  lengthDays,
  offerLabel,
  initialCheckIns,
  productName,
}: Props) {
  // Held locally so the tap feels instant; the server action reconciles after.
  const [dates, setDates] = useState(initialCheckIns);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDates(initialCheckIns), [initialCheckIns]);

  // Tell the server which timezone this person is actually in, once.
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local && local !== timezone) void setTimezone(local);
  }, [timezone]);

  const streak = computeStreak(dates, today);
  const progress = computeProgress(dates, startedOn, lengthDays, today);

  function handleTap() {
    if (streak.checkedInToday || pending) return;

    setError(null);
    setDates((prev) => [...prev, today]);

    startTransition(async () => {
      const result = await checkIn();
      if (!result.ok) {
        setDates((prev) => prev.filter((d) => d !== today));
        setError(result.error);
      }
    });
  }

  const circumference = 2 * Math.PI * 110;

  // Pure and deterministic: the same day always yields the same tip, so the
  // server render and the client hydration agree.
  const tip = tipForDay(progress.dayNumber, lengthDays);

  return (
    <div className="tracker-grid">
      <div className="tracker-main">
      <div className="ring-wrap">
        <svg className="ring" viewBox="0 0 260 260" aria-hidden="true">
          <circle className="ring-track" cx="130" cy="130" r="110" />
          <circle
            className="ring-fill"
            cx="130"
            cy="130"
            r="110"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress.fraction)}
          />
        </svg>
        <div className="ring-center">
          <div className="ring-count">{progress.completed}</div>
          <div className="ring-of">of {lengthDays} days</div>
          <div className="ring-label">
            {progress.finished ? 'Challenge complete' : `Day ${progress.dayNumber}`}
          </div>
        </div>
      </div>

      <button
        className={`tap${streak.checkedInToday ? ' done' : ''}${pending ? ' pending' : ''}`}
        onClick={handleTap}
        disabled={streak.checkedInToday || pending}
      >
        {streak.checkedInToday ? (
          <>
            ✓ Taken today
            <span className="tap-sub">See you tomorrow</span>
          </>
        ) : (
          <>
            I took my {productName} today
            <span className="tap-sub">Tap to log day {progress.completed + 1}</span>
          </>
        )}
      </button>

      {error && <p className="note bad">{error}</p>}

      <div className="stats">
        <div className="stat is-streak">
          <div className="stat-value">{streak.current}</div>
          <div className="stat-label">Day streak</div>
        </div>
        <div className="stat">
          <div className="stat-value">{streak.longest}</div>
          <div className="stat-label">Best streak</div>
        </div>
        <div className="stat">
          <div className="stat-value">{progress.daysRemaining}</div>
          <div className="stat-label">To go</div>
        </div>
      </div>

      </div>

      <div className="tracker-side">
      <div className="card">
        <h2>{tip.phase}</h2>
        <p className="tip-title">{tip.title}</p>
        <p className="tip-body">{tip.body}</p>
      </div>

      <div className="card">
        <h2>{offerLabel ?? `${lengthDays}-day challenge`}</h2>
        <DayGrid dates={dates} startedOn={startedOn} lengthDays={lengthDays} today={today} />
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: 'var(--brand)' }} /> Taken
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--day-missed)' }} /> Missed
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--day-upcoming)' }} /> Upcoming
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}

function DayGrid({
  dates,
  startedOn,
  lengthDays,
  today,
}: {
  dates: string[];
  startedOn: string;
  lengthDays: number;
  today: string;
}) {
  const done = new Set(dates);
  const elapsed = daysBetween(startedOn, today);

  const cells = Array.from({ length: lengthDays }, (_, i) => {
    const date = addDays(startedOn, i);
    const classes = ['day'];

    if (done.has(date)) classes.push('done');
    else if (i < elapsed) classes.push('missed');

    if (i === elapsed) classes.push('today');

    return { date, className: classes.join(' '), index: i };
  });

  return (
    <div
      className="grid"
      role="img"
      aria-label={`${done.size} of ${lengthDays} days taken`}
      style={{ ['--grid-cols' as string]: lengthDays <= 30 ? 10 : 15 }}
    >
      {cells.map((cell) => (
        <div key={cell.date} className={cell.className} title={`Day ${cell.index + 1} — ${cell.date}`} />
      ))}
    </div>
  );
}
