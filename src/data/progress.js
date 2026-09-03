/**
 * WHAT YOU KEEP GETTING WRONG.
 *
 * Every drill in the app has kept exactly one number: a best streak. That is a
 * scoreboard, not a memory — it cannot tell you that you have never once
 * identified a minor 6th, or that you are perfect on the 4 and hopeless on the
 * ♭7, and it certainly cannot ask you those more often.
 *
 * So: one record per ITEM per drill, and a picker that is weighted by how
 * badly you are doing on each. Leitner-lite — an item you get right moves up a
 * box and comes back less often; one you miss drops to the bottom and comes
 * back soon. Nothing here is a scheduler with dates: this is a practice tool,
 * not a flashcard app, and the useful behaviour is simply "ask me the ones I
 * keep missing".
 *
 * Storage is one localStorage key for everything, so a drill only has to name
 * itself and its items.
 */

const KEY = "progress.v1";
const BOXES = 5; // 0 = struggling, 4 = solid

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};
const write = (v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode, quota — practising still works, it just won't be remembered */
  }
};

/** Everything known about one drill: { [item]: { n, wrong, box, streak, last } }. */
export function statsFor(drill) {
  return read()[drill] || {};
}

/** One item's record, with the shape guaranteed. */
export function itemStat(drill, item) {
  const s = statsFor(drill)[String(item)];
  return s || { n: 0, wrong: 0, box: 0, streak: 0, last: 0 };
}

/**
 * Record an answer. `correct` moves the item up a box, a miss knocks it back
 * to the bottom — the whole point is that a miss should come back soon.
 */
export function record(drill, item, correct) {
  const all = read();
  const d = all[drill] || (all[drill] = {});
  const k = String(item);
  const s = d[k] || { n: 0, wrong: 0, box: 0, streak: 0, last: 0 };
  s.n += 1;
  s.last = Date.now();
  if (correct) {
    s.streak += 1;
    s.box = Math.min(BOXES - 1, s.box + 1);
  } else {
    s.wrong += 1;
    s.streak = 0;
    s.box = 0;
  }
  d[k] = s;
  write(all);
  return s;
}

/** How likely an item is to be asked. Higher = asked more often. */
export function weightOf(drill, item) {
  const s = itemStat(drill, item);
  // Never seen: ask it, but do not swamp everything else.
  if (s.n === 0) return 2.5;
  const missRate = s.wrong / s.n;
  // Box 0 items are three times as likely as box 4 ones; a bad hit rate adds
  // more on top. The floor keeps solid items in circulation.
  return 0.5 + (BOXES - s.box) * 0.6 + missRate * 3;
}

/**
 * Pick the next question, weighted. `avoid` keeps the same item from coming
 * up twice in a row, which otherwise happens constantly once one item is
 * clearly the weakest.
 */
export function pickWeighted(drill, items, { avoid = null, random = Math.random } = {}) {
  const pool = items.length > 1 && avoid != null ? items.filter((i) => String(i) !== String(avoid)) : items;
  if (!pool.length) return items[0];
  const weights = pool.map((i) => weightOf(drill, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * The practice log for a drill: how much you have done, how it is going, and
 * the handful of items actually worth working on.
 */
export function summary(drill, { label = String, limit = 4 } = {}) {
  const s = statsFor(drill);
  const items = Object.entries(s);
  const asked = items.reduce((a, [, v]) => a + v.n, 0);
  const wrong = items.reduce((a, [, v]) => a + v.wrong, 0);
  const weak = items
    .filter(([, v]) => v.n > 0 && v.wrong > 0)
    .sort((a, b) => b[1].wrong / b[1].n - a[1].wrong / a[1].n || b[1].wrong - a[1].wrong)
    .slice(0, limit)
    .map(([k, v]) => ({ item: k, label: label(k), n: v.n, wrong: v.wrong, rate: v.wrong / v.n, box: v.box }));
  const solid = items.filter(([, v]) => v.box >= BOXES - 1).length;
  return { asked, wrong, right: asked - wrong, accuracy: asked ? (asked - wrong) / asked : 0, weak, solid, seen: items.length };
}

/** Forget one drill (or everything) — for the "start over" button. */
export function resetDrill(drill) {
  const all = read();
  if (drill) delete all[drill];
  write(drill ? all : {});
}

export const BOX_COUNT = BOXES;
