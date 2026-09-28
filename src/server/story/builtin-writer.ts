import 'server-only';

import type { Breakdown, ScriptRequest, Scene } from '@/server/story/script';

/**
 * The built-in writer.
 *
 * Turns a premise into a full episode breakdown with no API key, no account and
 * no per-token charge — the same deal as the built-in narrator.
 *
 * It is a story engine, not a model: it reads the premise for who is in it and
 * what is at stake, casts them, then walks a dramatic arc laying beats down in
 * order. It recombines; it does not invent. What makes that work here is the
 * form — vertical short drama is written to a skeleton on purpose, and the
 * skeleton is the part a machine can hold. Every line below is a line a person
 * wrote; the engine decides which ones this premise earns and in what order.
 *
 * Deterministic: the same premise always yields the same series, so a Studio
 * reload does not silently rewrite a story someone already posted.
 */

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** FNV-1a. Small, stable, and good enough to spread premises across pools. */
function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — one line, decent distribution, and reproducible across runs. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

// ---------------------------------------------------------------------------
// Reading the premise
// ---------------------------------------------------------------------------

type GenreKey = 'supernatural' | 'revenge' | 'romance' | 'secret' | 'class';

/**
 * Role words worth casting around. Order matters: the first match in the
 * premise becomes the lead, so the more specific entries come first.
 */
const ROLE_WORDS: readonly string[] = [
  'probinsyana',
  'call-centre agent',
  'call center agent',
  'aswang',
  'engkanto',
  'manananggal',
  'tikbalang',
  'kasambahay',
  'yaya',
  'security guard',
  'jeepney driver',
  'tricycle driver',
  'seafarer',
  'barista',
  'waitress',
  'saleslady',
  'nurse',
  'doctor',
  'lawyer',
  'teacher',
  'student',
  'scholar',
  'maid',
  'driver',
  'agent',
  'secretary',
  'assistant',
  'heiress',
  'heir',
  'mistress',
  'widow',
  'orphan',
  'sister',
  'brother',
  'daughter',
  'son',
  'mother',
  'father',
  'wife',
  'husband',
  'fiancée',
  'fiancee',
  'boss',
  'ofw',
  'vendor',
  'farmer',
  'fisherman',
  'singer',
  'dancer',
];

const PLACE_WORDS: readonly [RegExp, string][] = [
  [/\bbarangay\b/i, 'the barangay'],
  [/\bmanila\b/i, 'Manila'],
  [/\bquezon city\b/i, 'Quezon City'],
  [/\bmakati\b/i, 'Makati'],
  [/\bcebu\b/i, 'Cebu'],
  [/\bdavao\b/i, 'Davao'],
  [/\bbaguio\b/i, 'Baguio'],
  [/\biloilo\b/i, 'Iloilo'],
  [/\bbicol\b/i, 'Bicol'],
  [/\bpalengke\b|\bmarket\b/i, 'the palengke'],
  [/\bhospital\b|\bclinic\b/i, 'the hospital'],
  [/\boffice\b|\bcall[- ]cent(er|re)\b/i, 'the office'],
  [/\bmansion\b|\bsubdivision\b|\bvillage\b/i, 'the village'],
  [/\bprovince\b|\bprobinsya\b/i, 'the province'],
  [/\bschool\b|\buniversity\b/i, 'the campus'],
  [/\bchurch\b|\bsimbahan\b/i, 'the church'],
  [/\bfarm\b|\bbukid\b/i, 'the farm'],
  [/\bsea\b|\bboat\b|\bisland\b/i, 'the island'],
];

const GENRE_SIGNALS: readonly [GenreKey, RegExp][] = [
  ['supernatural', /\baswang\b|\bengkanto\b|\bmanananggal\b|\btikbalang\b|\bkulam\b|\bghost\b|\bmulto\b|\bcurse\b|\bwitch\b|\bspirit\b/i],
  ['revenge', /\brevenge\b|\bruin(ed)?\b|\bdestroy(ed)?\b|\bpayback\b|\bgumanti\b|\bavenge\b|\bkill(ed)?\b|\bdebt\b|\bbetray(ed|al)?\b/i],
  ['romance', /\blove\b|\bwedding\b|\bmarry\b|\bmarriage\b|\bfianc|\bheart\b|\bkiss\b|\bcourt(ing|ship)\b/i],
  ['secret', /\bsecret\b|\bmissing\b|\bhidden\b|\blie[sd]?\b|\btruth\b|\bidentity\b|\bswap(ped)?\b|\bdna\b|\breal (mother|father|child)\b/i],
  ['class', /\brich\b|\bpoor\b|\bmaid\b|\bkasambahay\b|\bmansion\b|\binheritance\b|\bheir(ess)?\b|\bscholar\b|\butang\b/i],
];

const FEMALE_NAMES: readonly string[] = [
  'Rina', 'Maricel', 'Divina', 'Liza', 'Amihan', 'Belen', 'Cheska', 'Nenita',
];
const MALE_NAMES: readonly string[] = [
  'Ramon', 'Dodong', 'Elias', 'Nilo', 'Tonio', 'Vicente', 'Marlon', 'Bene',
];

interface Cast {
  hero: string;
  heroRole: string;
  rival: string;
  rivalRole: string;
  ally: string;
  place: string;
  stake: string;
  /** The object the story turns on — what gets found, shown and put down. */
  token: string;
  genre: GenreKey;
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "in Manila" for a named city, "at the office" for a described place. */
function at(place: string): string {
  return place.startsWith('the ') ? `at ${place}` : `in ${place}`;
}

/**
 * Reads the premise for a lead, an opposite number and a place.
 *
 * Premises arrive as anything from a paragraph to "aswang meet her love", so
 * every lookup falls through to something castable rather than failing.
 */
function readPremise(premise: string, random: () => number): Cast {
  const text = premise.toLowerCase();

  const roles = ROLE_WORDS.filter((role) => text.includes(role));
  const heroRole = roles[0] ?? 'stranger';
  const rivalRole = roles[1] ?? (heroRole === 'boss' ? 'employee' : 'boss');

  const place = PLACE_WORDS.find(([pattern]) => pattern.test(premise))?.[1] ?? 'the barangay';

  const genre = GENRE_SIGNALS.find(([, pattern]) => pattern.test(premise))?.[0] ?? 'secret';

  // A premise that says "her"/"she" gets a woman in the lead; the genre's
  // default otherwise. Short dramas in this market skew to a female lead.
  const heroIsWoman = !/\bhis\b|\bhe\b|\bhim\b/i.test(premise) || /\bher\b|\bshe\b/i.test(premise);
  const heroNames = heroIsWoman ? FEMALE_NAMES : MALE_NAMES;
  const rivalNames = heroIsWoman ? MALE_NAMES : FEMALE_NAMES;

  const hero = pick(heroNames, random);
  let rival = pick(rivalNames, random);
  if (rival === hero) rival = rivalNames[(rivalNames.indexOf(rival) + 1) % rivalNames.length];
  const ally = pick(
    (heroIsWoman ? FEMALE_NAMES : MALE_NAMES).filter((name) => name !== hero),
    random,
  );

  const STAKES: Record<GenreKey, readonly string[]> = {
    supernatural: ['what she becomes at night', 'the thing under her skin', 'the old debt her blood owes'],
    revenge: ['what they did to her father', 'the money that was never theirs', 'the name they took from her'],
    romance: ['the one person she cannot have', 'a promise made in the dark', 'the wedding neither of them wants'],
    secret: ['the sister nobody will name', 'what really happened that night', 'the truth she was paid to forget'],
    class: ['the debt her family cannot pay', 'a house that was built on her father', 'the inheritance she was written out of'],
  };

  const TOKENS: Record<GenreKey, readonly string[]> = {
    supernatural: ['the jar of ash', 'the bundle of black thread', 'the photograph that keeps changing'],
    revenge: ['the folder', 'the deed', 'the ledger'],
    romance: ['the unsent letter', 'the second ring', 'the torn invitation'],
    secret: ['the birth record', 'the voice note', 'the envelope of photographs'],
    class: ['the land title', 'the promissory note', 'the will'],
  };

  return {
    hero,
    heroRole,
    rival,
    rivalRole,
    ally,
    place,
    stake: pick(STAKES[genre], random),
    token: pick(TOKENS[genre], random),
    genre,
  };
}

// ---------------------------------------------------------------------------
// The arc
// ---------------------------------------------------------------------------

interface BeatSpec {
  title: (c: Cast) => string;
  beat: (c: Cast) => string;
  hook: (c: Cast) => string;
  lines: (c: Cast) => string[];
}

type PhaseKey = 'setup' | 'inciting' | 'escalation' | 'midpoint' | 'betrayal' | 'crisis' | 'climax';

/**
 * Phase weights. Episodes are handed out in this proportion, so a 6-part story
 * and a 40-part story both get a whole arc instead of the same eight beats on
 * a loop. `midpoint` and `climax` are pinned to one episode each — a reversal
 * that happens three times is not a reversal.
 */
const PHASE_WEIGHTS: readonly [PhaseKey, number][] = [
  ['setup', 1],
  ['inciting', 1],
  ['escalation', 3],
  ['midpoint', 0],
  ['betrayal', 3],
  ['crisis', 2],
  ['climax', 0],
];

const ARC: Record<PhaseKey, readonly BeatSpec[]> = {
  setup: [
    {
      title: (c) => `The ${c.heroRole}`,
      beat: (c) => `${c.hero} arrives ${at(c.place)} with one plan and no room to fail at it.`,
      hook: (c) => `Someone in this house already knows ${c.hero}'s real name.`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: I only need six months. After that, I'm gone.`,
        `${c.ally.toUpperCase()}: Everyone says that on their first day.`,
        `${c.hero.toUpperCase()}: I'm not everyone.`,
        `ACTION: She sets her bag down. She does not unpack it.`,
      ],
    },
    {
      title: () => 'First morning',
      beat: (c) => `The rules of ${c.place} are explained to ${c.hero}. One of them is a warning.`,
      hook: () => `"Whatever you hear tonight — you did not hear it."`,
      lines: (c) => [
        `${c.ally.toUpperCase()}: Don't go upstairs after ten. Ever.`,
        `${c.hero.toUpperCase()}: Bakit naman?`,
        `${c.ally.toUpperCase()}: Because the last one asked that question too.`,
      ],
    },
  ],
  inciting: [
    {
      title: () => 'What she saw',
      beat: (c) => `${c.hero} sees something she was not meant to see, and ${c.rival} sees her see it.`,
      hook: (c) => `${c.rival} smiles. "You're going to pretend that didn't happen."`,
      lines: (c) => [
        `ACTION: A door, half open. Voices inside stop.`,
        `${c.rival.toUpperCase()}: How long have you been standing there?`,
        `${c.hero.toUpperCase()}: Long enough to know I should go.`,
        `${c.rival.toUpperCase()}: Too late for that.`,
      ],
    },
    {
      title: () => 'The first lie',
      beat: (c) => `${c.hero} lies to stay close to ${c.stake}. It works, which is worse.`,
      hook: () => `"If you're lying to me, I'll find out. I always do."`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: Where were you last night?`,
        `${c.hero.toUpperCase()}: Sleeping. Where else would I be?`,
        `ACTION: Her hands are behind her back. They are shaking.`,
      ],
    },
  ],
  escalation: [
    {
      title: () => 'The proof',
      beat: (c) => `${titleCase(c.token)} surfaces — something about ${c.stake} that cannot be argued with.`,
      hook: () => `The date on it is three days before the funeral.`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: Where did you get this?`,
        `${c.ally.toUpperCase()}: It was in the room you're not allowed into.`,
        `${c.hero.toUpperCase()}: Then whoever put it there wanted it found.`,
      ],
    },
    {
      title: () => 'The offer',
      beat: (c) => `Money is put on the table in exchange for ${c.hero}'s silence.`,
      hook: (c) => `"Take it, ${c.hero}. The ones who didn't aren't here to advise you."`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: Name a number.`,
        `${c.hero.toUpperCase()}: You can't afford what you took.`,
        `${c.rival.toUpperCase()}: Everyone has a number. Yours just has more zeroes than you think.`,
      ],
    },
    {
      title: () => 'The witness',
      beat: (c) => `Somebody else ${at(c.place)} saw it too. They have not decided what to do about it.`,
      hook: () => `"I'll tell them everything. Unless you help me first."`,
      lines: (c) => [
        `${c.ally.toUpperCase()}: I know what you're doing here.`,
        `${c.hero.toUpperCase()}: Then you know why I can't stop.`,
      ],
    },
    {
      title: () => 'The debt',
      beat: (c) => `An old obligation comes due, and ${c.hero} is the only one who can pay it.`,
      hook: () => `"Your father signed this. That makes it yours now."`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: Utang is utang. It doesn't die when the borrower does.`,
        `ACTION: He puts ${c.token} on the table and does not let go of it.`,
        `${c.hero.toUpperCase()}: Neither does what you owe me.`,
      ],
    },
    {
      title: () => 'Closer than safe',
      beat: (c) => `${c.hero} and ${c.rival} are alone, and the hatred between them starts to look like something else.`,
      hook: () => `Neither of them moves. That is the problem.`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: You look at me like you're measuring a coffin.`,
        `${c.hero.toUpperCase()}: I am.`,
        `${c.rival.toUpperCase()}: Then why are you still standing this close?`,
      ],
    },
  ],
  midpoint: [
    {
      title: () => 'What she is',
      beat: (c) => `The thing ${c.hero} has been hiding is seen in full, by the one person who could destroy her with it.`,
      hook: (c) => `"I've known since the first night, ${c.hero}. I was waiting for you to say it."`,
      lines: (c) => [
        `ACTION: The light goes on. Nowhere left to stand.`,
        `${c.rival.toUpperCase()}: Say it out loud. I want to hear you say it.`,
        `${c.hero.toUpperCase()}: ...You already know.`,
        `${c.rival.toUpperCase()}: I do. That's why you're still breathing.`,
      ],
    },
  ],
  betrayal: [
    {
      title: () => 'The longer game',
      beat: (c) => `${c.ally} is revealed to have been playing for the other side the whole time.`,
      hook: (c) => `"Who do you think told them where to find you, ${c.hero}?"`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: I trusted you.`,
        `${c.ally.toUpperCase()}: I know. That was the job.`,
      ],
    },
    {
      title: () => 'The wrong funeral',
      beat: (c) => `Someone is buried. ${c.hero} is the only one who knows the coffin is wrong.`,
      hook: () => `She counts the mourners twice. One of them should not be alive.`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: That's not him.`,
        `${c.ally.toUpperCase()}: Lower your voice.`,
        `${c.hero.toUpperCase()}: That is not him.`,
      ],
    },
    {
      title: () => 'Blood remembers',
      beat: (c) => `${c.stake} turns out to reach back a generation further than ${c.hero} knew.`,
      hook: () => `"Your mother stood exactly where you're standing. She chose wrong."`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: You think this started with you?`,
        `${c.hero.toUpperCase()}: I think it ends with me.`,
      ],
    },
    {
      title: () => 'The room with no door',
      beat: (c) => `${c.hero} is cornered ${at(c.place)} with everything she has gathered and no way to send it.`,
      hook: () => `The signal bar drops to nothing. Footsteps on the stairs.`,
      lines: (c) => [
        `ACTION: She hits send. The wheel spins. It keeps spinning.`,
        `${c.rival.toUpperCase()} (outside): Open it. I'd rather you opened it.`,
      ],
    },
  ],
  crisis: [
    {
      title: () => 'Everything, out loud',
      beat: (c) => `${c.hero} says the whole truth in front of the people who buried it.`,
      hook: () => `Nobody speaks. Then, from the back of the room, someone starts clapping.`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: Show them ${c.token}. Show them in front of everyone.`,
        `${c.rival.toUpperCase()}: You have no idea what you've just started.`,
      ],
    },
    {
      title: () => 'The price',
      beat: (c) => `Winning will cost ${c.hero} the one person she came here still loving.`,
      hook: (c) => `"Choose, ${c.hero}. You don't get to keep both."`,
      lines: (c) => [
        `${c.ally.toUpperCase()}: If you do this, I lose everything.`,
        `${c.hero.toUpperCase()}: If I don't, I already have.`,
      ],
    },
    {
      title: () => 'One phone call',
      beat: (c) => `${c.hero} makes the call she has been avoiding since episode one.`,
      hook: () => `The voice that answers is the one she buried.`,
      lines: (c) => [
        `${c.hero.toUpperCase()}: ...Hello? Sino 'to?`,
        `ACTION: Silence on the line. Then breathing.`,
      ],
    },
  ],
  climax: [
    {
      title: () => 'The reckoning',
      beat: (c) => `${c.hero} and ${c.rival} end it, in front of everyone, with ${c.stake} on the table between them.`,
      hook: (c) => `${c.hero} walks out first. She does not look back, and that is the answer.`,
      lines: (c) => [
        `${c.rival.toUpperCase()}: After everything — you still think you've won?`,
        `${c.hero.toUpperCase()}: I think I'm the one still standing. That's enough.`,
        `ACTION: She sets ${c.token} down and leaves it where everyone can see.`,
      ],
    },
  ],
};

/**
 * The hardest hook in the series goes on episode 5.
 *
 * Episodes 1–5 are free and 6 is the first one anybody pays for, so 5 is the
 * only episode whose ending has to sell something. Whatever beat lands there
 * keeps its scene and gets this ending instead.
 */
const PAYWALL_HOOKS: readonly ((c: Cast) => string)[] = [
  (c) => `And that is when ${c.hero} realises the person who hired her already knew her father's name.`,
  (c) => `The photograph is twenty years old. ${c.hero} is in it, and she has not been born yet.`,
  (c) => `"You were never the one investigating, ${c.hero}. You were the one being delivered."`,
  (c) => `${c.rival} says her real name. Not the one on her papers — the one only two people alive know.`,
];

/** Spreads `episodes` across the phases, keeping the pinned ones single. */
function allocate(episodes: number): PhaseKey[] {
  const order = PHASE_WEIGHTS.map(([key]) => key);
  const pinned: PhaseKey[] = ['setup', 'midpoint', 'climax'];

  // Every phase gets at least one episode until there are not enough to go
  // round, at which point the flexible middle collapses before the spine does.
  const plan: PhaseKey[] = [];
  if (episodes <= order.length) {
    // Spine first — a four-part story still needs a beginning, a turn and an
    // ending. The middle is what gets dropped when there is no room for it.
    const priority: PhaseKey[] = ['setup', 'climax', 'midpoint', 'inciting', 'crisis', 'betrayal', 'escalation'];
    const keep = new Set(priority.slice(0, Math.max(1, episodes)));
    for (const key of order) if (keep.has(key)) plan.push(key);
    return plan.slice(0, episodes);
  }

  for (const key of order) plan.push(key);

  const flexible = PHASE_WEIGHTS.filter(([key]) => !pinned.includes(key));
  const totalWeight = flexible.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = episodes - plan.length;

  const extra = new Map<PhaseKey, number>();
  for (const [key, weight] of flexible) {
    const share = Math.floor((remaining * weight) / totalWeight);
    extra.set(key, share);
  }
  remaining -= [...extra.values()].reduce((sum, n) => sum + n, 0);
  // Anything left over goes to escalation — the phase that can carry it.
  extra.set('escalation', (extra.get('escalation') ?? 0) + remaining);

  const spread: PhaseKey[] = [];
  for (const key of order) {
    spread.push(key);
    for (let i = 0; i < (extra.get(key) ?? 0); i += 1) spread.push(key);
  }
  return spread;
}

// ---------------------------------------------------------------------------
// Writing it out
// ---------------------------------------------------------------------------

const SERIES_TITLES: Record<GenreKey, readonly string[]> = {
  supernatural: ['Blood Will Answer', 'What Wakes at Ten', 'The Night Shift of Her Skin'],
  revenge: ['Six Months to Ruin', 'The Debt Collector', 'Everything They Took'],
  romance: ['The Wrong Wedding', 'Promise Me in the Dark', 'Almost Yours'],
  secret: ['The Sister Nobody Names', 'What Happened That Night', 'Paid to Forget'],
  class: ['The Maid Who Owned the House', 'Utang na Loob', 'Written Out'],
};

const TAGS: Record<GenreKey, readonly string[]> = {
  supernatural: ['drama', 'supernatural', 'aswang'],
  revenge: ['drama', 'revenge', 'family'],
  romance: ['drama', 'romance', 'forbidden'],
  secret: ['drama', 'mystery', 'family'],
  class: ['drama', 'class', 'revenge'],
};

function seriesTitle(cast: Cast, request: ScriptRequest, random: () => number): string {
  const given = request.title?.trim();
  if (given) return given;

  const first = request.premise.trim().split(/[.!?\n]/)[0]?.trim() ?? '';
  // A premise can be its own title, but only when it was typed like one:
  // capitalised, short enough for a poster, and not opening with an article.
  // "aswang meet her love" is a premise, not a title — it takes the pool.
  const looksTyped = /^[A-Z]/.test(first) && !/^(a|an|the)\s/i.test(first);
  if (looksTyped && first.length >= 12 && first.length <= 38) {
    return first;
  }
  return pick(SERIES_TITLES[cast.genre], random);
}

// ---------------------------------------------------------------------------
// Exchange blocks
// ---------------------------------------------------------------------------

/**
 * A scene is built from exchanges, not from one beat.
 *
 * An episode used to be four lines, which is fine over fifteen seconds and
 * absurd over five minutes — each line would hold the screen for over a minute.
 * These are the units a scene is actually assembled from: an opening, someone
 * pressing, someone deflecting, the turn, and the button. Eight of them, drawn
 * without repeats and seeded per episode, make a conversation with a shape.
 *
 * They still recombine rather than invent. The pools are deliberately large so
 * two episodes in the same act do not read as the same page twice.
 */
type Block = (c: Cast) => string[];

const H = (c: Cast) => c.hero.toUpperCase();
const R = (c: Cast) => c.rival.toUpperCase();
const A = (c: Cast) => c.ally.toUpperCase();

const OPENERS: readonly Block[] = [
  (c) => [
    `ACTION: A door closes somewhere below. Neither of them looks at it.`,
    `${R(c)}: You're early.`,
    `${H(c)}: I couldn't sleep.`,
    `${R(c)}: Nobody in this house sleeps. You'll get used to it.`,
    `${H(c)}: I'm not planning to be here that long.`,
  ],
  (c) => [
    `${A(c)}: Sit. You've been standing since six.`,
    `${H(c)}: If I sit down I won't get up.`,
    `${A(c)}: Then don't get up.`,
    `ACTION: She sits. She keeps her bag on her lap.`,
  ],
  (c) => [
    `ACTION: Rain on the roof, steady, like something counting.`,
    `${H(c)}: Can I ask you something?`,
    `${A(c)}: You can ask.`,
    `${H(c)}: That's not the same as answering.`,
    `${A(c)}: No. It isn't.`,
  ],
  (c) => [
    `${R(c)}: Do you know why I hired you?`,
    `${H(c)}: Because I was cheap.`,
    `${R(c)}: Because you didn't ask questions at the interview.`,
    `${H(c)}: I had questions.`,
    `${R(c)}: I know. That's the part I liked.`,
  ],
  (c) => [
    `ACTION: The light in the hallway is out again. Nobody has fixed it.`,
    `${A(c)}: Walk in the middle. The boards on the left talk.`,
    `${H(c)}: Talk to who?`,
    `${A(c)}: Whoever's listening.`,
  ],
  (c) => [
    `${H(c)}: You've been watching me all week.`,
    `${R(c)}: I watch everyone.`,
    `${H(c)}: Not like this.`,
    `${R(c)}: No. Not like this.`,
  ],
];

const PRESSES: readonly Block[] = [
  (c) => [
    `${H(c)}: I want to know what happened to him.`,
    `${R(c)}: He signed. That's what happened.`,
    `${H(c)}: He couldn't read that contract and you knew it.`,
    `${R(c)}: He could read his own name. That was enough.`,
    `ACTION: Her hands go flat on the table so they stop shaking.`,
  ],
  (c) => [
    `${H(c)}: Say her name.`,
    `${R(c)}: Why?`,
    `${H(c)}: Because you've been avoiding it for a month and I want to hear how it sounds in your mouth.`,
    `${R(c)}: ...You don't want that.`,
    `${H(c)}: I do. Say it.`,
  ],
  (c) => [
    `${H(c)}: Where were you that night?`,
    `${R(c)}: Working.`,
    `${H(c)}: Everyone in this house was working that night. Nobody was home. And yet somebody locked that gate from the inside.`,
    `${R(c)}: Careful.`,
  ],
  (c) => [
    `${A(c)}: Stop looking. Please.`,
    `${H(c)}: Give me one reason.`,
    `${A(c)}: Because the last person who looked is in the ground and we all went to the funeral and cried like it was an accident.`,
    `ACTION: Silence. Somewhere a clock keeps going.`,
  ],
  (c) => [
    `${H(c)}: How much?`,
    `${R(c)}: Excuse me?`,
    `${H(c)}: How much did it cost to make everyone in this barangay forget a whole family?`,
    `${R(c)}: Less than you'd think. That's what should frighten you.`,
  ],
  (c) => [
    `${H(c)}: I found the second set of books.`,
    `${R(c)}: Then you found nothing. There's no second set.`,
    `${H(c)}: There is. It's in your handwriting and it's dated.`,
    `${R(c)}: ...Who else has seen it?`,
    `${H(c)}: That's the first real question you've asked me.`,
  ],
  (c) => [
    `${H(c)}: You buried her under another name.`,
    `${R(c)}: I buried her properly. That's more than anyone did for me.`,
    `${H(c)}: Properly is not the same as honestly.`,
  ],
  (c) => [
    `${A(c)}: They're going to ask you where you were.`,
    `${H(c)}: Then I'll tell them.`,
    `${A(c)}: If you tell them, you lose the house, the job, all of it.`,
    `${H(c)}: I came here with nothing. You keep forgetting that.`,
  ],
];

const DEFLECTS: readonly Block[] = [
  (c) => [
    `${R(c)}: You think you're the first one to stand in that doorway and demand something?`,
    `${H(c)}: No.`,
    `${R(c)}: Good. Then you know how it usually ends.`,
    `${H(c)}: I know how it ended for them. Not for me.`,
  ],
  (c) => [
    `${R(c)}: Let me tell you what happens if you keep pulling that thread.`,
    `ACTION: He counts it off on his fingers, unhurried.`,
    `${R(c)}: Your mother's clinic. Your brother's scholarship. The lease on the room you send money for.`,
    `${H(c)}: You've been busy.`,
    `${R(c)}: I've been thorough. There's a difference.`,
  ],
  (c) => [
    `${A(c)}: Whatever he told you, he told me the same thing four years ago.`,
    `${H(c)}: And?`,
    `${A(c)}: And I believed him. Look where I'm standing.`,
  ],
  (c) => [
    `ACTION: He slides an envelope across. She doesn't touch it. She doesn't move it back either.`,
    `${H(c)}: What is this supposed to be?`,
    `${R(c)}: A door. You walk through it and none of this follows you.`,
    `${H(c)}: And my father? Does he walk through it too?`,
    `${R(c)}: ...There's only the one envelope.`,
  ],
  (c) => [
    `${R(c)}: You keep saying "the truth" like it's a door.`,
    `${H(c)}: It is.`,
    `${R(c)}: It's a window. You can see through it, and you still can't get out.`,
  ],
  (c) => [
    `${A(c)}: Don't make me choose.`,
    `${H(c)}: I'm not making you do anything.`,
    `${A(c)}: You are. Just by standing there.`,
  ],
];

const TURNS: readonly Block[] = [
  (c) => [
    `ACTION: She puts ${c.token} on the table between them. Face up.`,
    `${R(c)}: ...Where did you get that.`,
    `${H(c)}: You should be asking who else has a copy.`,
    `${R(c)}: Who else has a copy.`,
    `${H(c)}: Now you're asking.`,
  ],
  (c) => [
    `${A(c)}: I have to tell you something, and after I do you won't want to look at me.`,
    `${H(c)}: Say it.`,
    `${A(c)}: Who do you think told them where to find you?`,
    `ACTION: The room does not change. Everything in it does.`,
  ],
  (c) => [
    `${H(c)}: The date on it is three days before the funeral.`,
    `${R(c)}: That's a mistake.`,
    `${H(c)}: It's typed. It's stamped. It's signed by a man who was supposed to already be dead.`,
    `${R(c)}: ...Give it to me.`,
    `${H(c)}: No.`,
  ],
  (c) => [
    `${R(c)}: I've known since the first night.`,
    `${H(c)}: Since—`,
    `${R(c)}: Since you gave me a surname that doesn't exist in that province. I was waiting to see how long you'd keep it up.`,
  ],
  (c) => [
    `ACTION: The photograph is twenty years old. She is in it, and she has not been born yet.`,
    `${H(c)}: That's not possible.`,
    `${A(c)}: No.`,
    `${H(c)}: Then explain it.`,
    `${A(c)}: I can't. That's why I kept it.`,
  ],
  (c) => [
    `${H(c)}: Ask him what he signed. Ask him in front of everyone.`,
    `ACTION: Nobody speaks. Then, from the back of the room, somebody starts clapping.`,
    `${R(c)}: ...Sit down.`,
    `${H(c)}: I've been sitting down for six months. Ask him.`,
  ],
];

const CLOSERS: readonly Block[] = [
  (c) => [
    `${R(c)}: Go to bed, ${c.hero}.`,
    `${H(c)}: I'm not tired.`,
    `${R(c)}: I didn't say you were.`,
    `ACTION: She goes. She does not turn her back on him doing it.`,
  ],
  (c) => [
    `${A(c)}: Whatever you do next — don't do it here.`,
    `${H(c)}: Why?`,
    `${A(c)}: Because this house keeps everything that happens in it.`,
  ],
  (c) => [
    `ACTION: She sets ${c.token} down and leaves it where anyone can see.`,
    `${H(c)}: I'm done carrying it.`,
    `${R(c)}: You think that makes it lighter?`,
    `${H(c)}: No. I think it makes it everyone's.`,
  ],
  (c) => [
    `${H(c)}: Tomorrow I'm going to ask you again.`,
    `${R(c)}: And I'll give you the same answer.`,
    `${H(c)}: Then I'll ask the day after that.`,
    `ACTION: He watches her go. For the first time, he looks tired.`,
  ],
  (c) => [
    `${A(c)}: You're not going to let this go, are you.`,
    `${H(c)}: Would you?`,
    `${A(c)}: ...No. I'd have let it go years ago and hated myself every day since.`,
  ],
];

/**
 * Assembles one episode's scene.
 *
 * The beat's own lines stay the spine — they are what the arc needs to happen —
 * and the blocks build the conversation around them. Blocks are drawn without
 * repeats inside an episode, so nobody says the same thing twice in one scene.
 */
function composeScene(cast: Cast, spine: string[], random: () => number): string[] {
  // Keyed by the pool itself. Keying by its length collided — three of the
  // pools hold six blocks each, so a draw from one silently blocked the same
  // index in the others and the fallback could then repeat for real.
  const drawn = new Map<readonly Block[], Set<number>>();

  // Every substantive line already in the scene, spine included. A block that
  // would repeat one is passed over: the pools were written by hand against the
  // arc, and a line copied into both ends up said twice in the same episode.
  // Short replies ("No.", "And?") are exempt — a character can say those twice.
  const said = new Set<string>();
  const substantive = (line: string) => line.length > 24 && !line.startsWith('ACTION:');
  const remember = (lines: string[]) => {
    for (const line of lines) if (substantive(line)) said.add(line);
  };
  const echoes = (lines: string[]) => lines.some((line) => substantive(line) && said.has(line));

  remember(spine);

  const draw = (pool: readonly Block[]): string[] => {
    let taken = drawn.get(pool);
    if (!taken) {
      taken = new Set<number>();
      drawn.set(pool, taken);
    }
    // Every block used once already: start the pool over rather than stall.
    if (taken.size >= pool.length) taken.clear();

    const index = Math.floor(random() * pool.length) % pool.length;
    for (let step = 0; step < pool.length; step += 1) {
      const candidate = (index + step) % pool.length;
      if (taken.has(candidate)) continue;
      const block = pool[candidate](cast);
      if (echoes(block)) continue;

      taken.add(candidate);
      remember(block);
      return block;
    }

    // Nothing clean left — take the first unused one anyway rather than
    // dropping a chunk of the episode.
    for (let step = 0; step < pool.length; step += 1) {
      const candidate = (index + step) % pool.length;
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      const block = pool[candidate](cast);
      remember(block);
      return block;
    }

    taken.add(index);
    return pool[index](cast);
  };

  // Twelve blocks, not eight. Measured: eight ran about three minutes once the
  // narrator read it, and the episode claims five. The scene has to be long
  // enough to actually speak for that long.
  return [
    ...draw(OPENERS),
    '',
    ...draw(PRESSES),
    '',
    ...draw(DEFLECTS),
    '',
    ...spine,
    '',
    ...draw(PRESSES),
    '',
    ...draw(TURNS),
    '',
    ...draw(DEFLECTS),
    '',
    ...draw(PRESSES),
    '',
    ...draw(TURNS),
    '',
    ...draw(DEFLECTS),
    '',
    ...draw(PRESSES),
    '',
    ...draw(CLOSERS),
  ];
}

/** Around five minutes per episode, running a little longer as stakes rise. */
function runtime(index: number, total: number): number {
  const progress = total <= 1 ? 1 : index / (total - 1);
  return Math.round(285 + progress * 40);
}

export function writeBreakdown(request: ScriptRequest): Breakdown {
  const premise = request.premise.trim();
  const random = rng(seedFrom(premise + '|' + request.episodes));
  const cast = readPremise(premise, random);

  const phases = allocate(request.episodes);
  const used = new Map<PhaseKey, number>();

  const scenes: Scene[] = phases.map((phase, index) => {
    const pool = ARC[phase];
    const taken = used.get(phase) ?? 0;
    used.set(phase, taken + 1);

    const spec = pool[taken % pool.length];
    const repeat = Math.floor(taken / pool.length);
    const n = index + 1;

    const title = spec.title(cast);
    const hook = n === 5 ? pick(PAYWALL_HOOKS, random)(cast) : spec.hook(cast);

    const heading = `INT. ${cast.place.replace(/^the /i, '').toUpperCase()} — ${
      index % 2 === 0 ? 'NIGHT' : 'DAY'
    }`;

    return {
      scene_number: n,
      title: repeat > 0 ? `${title} (${repeat + 1})` : title,
      beat: spec.beat(cast),
      script: [
        heading,
        '',
        ...composeScene(cast, spec.lines(cast), rng(seedFrom(`${premise}|${n}`))),
        '',
        `HOOK — ${hook}`,
      ].join('\n'),
      hook,
      duration_seconds: runtime(index, request.episodes),
    };
  });

  const logline =
    premise.length <= 180
      ? premise
      : `${premise.slice(0, 180).replace(/\s+\S*$/, '')}…`;

  return {
    title: seriesTitle(cast, request, random),
    logline,
    tags: [...TAGS[cast.genre]],
    scenes,
  };
}
