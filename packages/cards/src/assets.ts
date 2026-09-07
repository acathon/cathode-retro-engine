/**
 * The card art, and who to thank for it.
 *
 * One copy lives in this package rather than one per example, so the four
 * card games share a single 55 KB file and a single credit line.
 */

/** The sheet, resolved relative to this package so any example can load it. */
export const CARD_SHEET_URL = new URL('../assets/playing_cards.png', import.meta.url).href;

export interface ArtCredit {
  title: string;
  author: string;
  license: string;
  url: string;
}

/**
 * Shown on every card game's screen and page.
 *
 * The licence asks for nothing, which is exactly why the credit is here: art
 * that is free to use is still art somebody drew.
 */
export const CARD_ART: ArtCredit = {
  title: '8-BIT PLAYING CARDS',
  author: 'sdkfz181tiger',
  license: 'Free for personal and commercial use',
  url: 'https://sdkfz181tiger.itch.io/assets-for-8bit-playing-card-games',
};

/** A one-line credit for a HUD. Reads correctly with or without an author. */
export const cardArtCredit = (): string =>
  CARD_ART.author ? `CARD ART: ${CARD_ART.title} BY ${CARD_ART.author}` : `CARD ART: ${CARD_ART.title}`;
