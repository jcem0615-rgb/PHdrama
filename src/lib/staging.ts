/**
 * Where an episode takes place, read from its own words.
 *
 * Shared so the reel and the poster agree: a card for an episode set in a
 * hospital corridor should show a hospital corridor, and the reel that plays
 * when you tap it should be the same place. Two copies of these patterns would
 * drift apart within a week.
 *
 * Pure — no DOM, no server bindings — so both the canvas renderer and the SVG
 * poster route can use it.
 */

export type Location = 'street' | 'room' | 'office' | 'corridor' | 'field' | 'church';

export interface Staging {
  location: Location;
  /** Rain reads as grief or threat, and it is the cheapest weather to draw. */
  rain: boolean;
  night: boolean;
}

const LOCATION_SIGNALS: readonly [Location, RegExp][] = [
  ['corridor', /hospital|clinic|ward|morgue|funeral|coffin|buried|doctor|nurse/i],
  ['church', /church|simbahan|wedding|marry|marriage|bride|vow|altar|priest/i],
  ['office', /office|boss|contract|signed|document|papers|ledger|deed|call[- ]cent|desk|meeting/i],
  ['field', /province|probinsya|farm|bukid|field|island|sea|barrio|harvest|mountain/i],
  ['room', /house|room|home|kitchen|bed|door|upstairs|mansion|sala|maid|kasambahay/i],
  ['street', /street|barangay|alley|jeep|tricycle|palengke|market|city|manila|night out|outside/i],
];

export function stageFrom(text: string): Staging {
  const location = LOCATION_SIGNALS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'street';

  return {
    location,
    rain: /rain|storm|ulan|bagyo|flood|wet|grief|funeral|buried|cry/i.test(text),
    // Short drama lives at night; daylight is the exception the text has to earn.
    night: !/morning|daylight|noon|sunrise|afternoon|beach|harvest/i.test(text),
  };
}
