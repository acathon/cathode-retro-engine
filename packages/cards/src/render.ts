/**
 * The table: sheets, sprite pools and a per-frame draw list.
 *
 * Card games do not animate much, but they do rearrange constantly — a hand
 * that was five cards is four next frame, a pot that was three chips is
 * eleven. Creating and destroying sprites to match would allocate every
 * frame, so instead this keeps pools and replays a draw list:
 *
 *     table.begin();
 *     for (const c of hand) table.card(c, x, y);
 *     table.end();          // hides whatever the list did not use
 *
 * Sprites are handed out in call order and layered in call order, so a card
 * drawn later overlaps one drawn earlier, which is the same rule as a real
 * table.
 */
import { Scene, Sprite, TileMap } from '@cathode/sdk';
import type { Card } from './card';
import { chipStack } from './chips';
import {
  BACK_FRAME, CARD_H, CARD_W, CHIP, O_CURSOR, O_EMPTY, O_HELD, O_TARGET,
  T_FELT, T_FELT_DARK, TILE, cardFrame, chipSheet, feltSheet, overlaySheet,
} from './geometry';
import { generateDeckSheet } from './sheet';

/** Which overlay to draw over a slot. */
export type Marker = 'empty' | 'cursor' | 'held' | 'target';

const MARKER_FRAME: Record<Marker, number> = {
  empty: O_EMPTY,
  cursor: O_CURSOR,
  held: O_HELD,
  target: O_TARGET,
};

/** Layer bands, so overlays always resolve above the cards they mark. */
const CARD_LAYER = 10;
const MARKER_LAYER = 400;
const CHIP_LAYER = 300;

export interface CardTableOptions {
  /**
   * A card sheet to use instead of the generated one — 15 columns by 4 rows
   * of `CARD_W` x `CARD_H` cells. Missing or unreadable falls back silently,
   * which is how the examples ship without redistributing licensed art.
   */
  cardsUrl?: string;
  /** Fill the screen with felt. Off for games that draw their own table. */
  felt?: boolean;
  width: number;
  height: number;
}

// A minimal shape for the engine handle, so this module does not depend on
// the concrete Cathode class and can be constructed in a test double.
interface SheetHost {
  loadSheet(url: string, w: number, h: number): Promise<number>;
  raw: { upload_sheet(w: number, h: number, tw: number, th: number, px: Uint8Array): number };
}

export class CardTable {
  /** Which deck is on the table: the supplied sheet, or the generated one. */
  readonly deckSource: string;

  private cardPool: Sprite[] = [];
  private markerPool: Sprite[] = [];
  private chipPool: Sprite[] = [];
  private cardsUsed = 0;
  private markersUsed = 0;
  private chipsUsed = 0;

  private constructor(
    private readonly scene: Scene,
    private readonly cardSheet: number,
    private readonly overlaySheet: number,
    private readonly chipsSheet: number,
    deckSource: string,
  ) {
    this.deckSource = deckSource;
  }

  static async create(
    engine: SheetHost,
    scene: Scene,
    opts: CardTableOptions,
  ): Promise<CardTable> {
    let cards: number;
    let source: string;
    if (opts.cardsUrl) {
      try {
        cards = await engine.loadSheet(opts.cardsUrl, CARD_W, CARD_H);
        source = opts.cardsUrl.split('/').pop() ?? 'sheet';
      } catch {
        ({ cards, source } = generated(engine));
      }
    } else {
      ({ cards, source } = generated(engine));
    }

    const overlay = overlaySheet();
    const overlayHandle = engine.raw.upload_sheet(
      overlay.w, overlay.h, CARD_W, CARD_H, overlay.pixels,
    );
    const chips = chipSheet();
    const chipHandle = engine.raw.upload_sheet(chips.w, chips.h, CHIP, CHIP, chips.pixels);

    if (opts.felt !== false) layFelt(engine, scene, opts.width, opts.height);

    return new CardTable(scene, cards, overlayHandle, chipHandle, source);
  }

  // --- Frame ---------------------------------------------------------------

  /** Start a new draw list. Everything drawn last frame is forgotten. */
  begin(): void {
    this.cardsUsed = 0;
    this.markersUsed = 0;
    this.chipsUsed = 0;
  }

  /** Hide every pooled sprite the frame did not claim. */
  end(): void {
    for (let i = this.cardsUsed; i < this.cardPool.length; i++) this.cardPool[i].active = false;
    for (let i = this.markersUsed; i < this.markerPool.length; i++) this.markerPool[i].active = false;
    for (let i = this.chipsUsed; i < this.chipPool.length; i++) this.chipPool[i].active = false;
  }

  /** Draw a card at its own orientation: face up shows the face, else a back. */
  card(card: Card, x: number, y: number): void {
    this.blit(x, y, card.faceUp ? cardFrame(card.suit, card.rank) : BACK_FRAME);
  }

  /** Draw a face-down card without needing one to exist — a stock pile. */
  back(x: number, y: number): void {
    this.blit(x, y, BACK_FRAME);
  }

  /** Draw a card face up regardless of its own flag — a showdown reveal. */
  face(card: Card, x: number, y: number): void {
    this.blit(x, y, cardFrame(card.suit, card.rank));
  }

  private blit(x: number, y: number, frame: number): void {
    const s = this.take(this.cardPool, this.cardsUsed++, this.cardSheet, CARD_LAYER);
    s.frame = frame;
    s.x = Math.round(x);
    s.y = Math.round(y);
    s.layer = CARD_LAYER + this.cardsUsed;
  }

  /** A card-sized overlay: an empty slot, the cursor, a highlight. */
  marker(kind: Marker, x: number, y: number): void {
    const s = this.take(this.markerPool, this.markersUsed++, this.overlaySheet, MARKER_LAYER);
    s.frame = MARKER_FRAME[kind];
    s.x = Math.round(x);
    s.y = Math.round(y);
    // Empty slots belong under the cards; the rest belong over them.
    s.layer = kind === 'empty' ? CARD_LAYER - 5 : MARKER_LAYER + this.markersUsed;
  }

  /**
   * A stack of chips worth `amount`, growing upward from (x, y).
   *
   * Capped at `max` chips: a four-figure pot is thirty-odd chips, which is a
   * tall spike of sprites that tells the player less than the number does.
   */
  chips(amount: number, x: number, y: number, max = 8): number {
    const stack = chipStack(amount);
    const shown = Math.min(stack.length, max);
    for (let i = 0; i < shown; i++) {
      const s = this.take(this.chipPool, this.chipsUsed++, this.chipsSheet, CHIP_LAYER);
      s.frame = DENOM_FRAME[stack[i]] ?? 0;
      s.x = Math.round(x);
      s.y = Math.round(y - i * 3);
      s.layer = CHIP_LAYER + i;
    }
    return shown;
  }

  private take(pool: Sprite[], index: number, sheet: number, layer: number): Sprite {
    if (index >= pool.length) {
      // Grows once per new peak and never shrinks, so a busy frame costs one
      // allocation the first time it happens and none afterwards.
      pool.push(new Sprite(this.scene, { sheet, frame: 0, x: 0, y: 0, layer }));
    }
    const s = pool[index];
    s.active = true;
    return s;
  }
}

/** Chip denomination to sheet frame, in the order `chipSheet` draws them. */
const DENOM_FRAME: Record<number, number> = { 1: 0, 5: 1, 25: 2, 100: 3, 500: 4 };

function generated(engine: SheetHost): { cards: number; source: string } {
  const deck = generateDeckSheet();
  return {
    cards: engine.raw.upload_sheet(deck.w, deck.h, CARD_W, CARD_H, deck.pixels),
    source: 'generated deck',
  };
}

/** A checkered felt tilemap, drawn once and never touched again. */
function layFelt(engine: SheetHost, scene: Scene, width: number, height: number): void {
  const felt = feltSheet();
  const handle = engine.raw.upload_sheet(felt.w, felt.h, TILE, TILE, felt.pixels);

  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const map = new TileMap(scene, {
    name: 'Felt', cols, rows, tileWidth: TILE, tileHeight: TILE,
  });
  const layer = map.addLayer('Felt', handle, false);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      map.setTile(layer, col, row, (col + row) % 2 ? T_FELT : T_FELT_DARK);
    }
  }
  map.commit();
}
