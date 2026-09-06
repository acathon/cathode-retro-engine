/** Headless check for examples/gin-rummy. See lib.mjs for how to run it. */
import { arg, check, finish, open } from './lib.mjs';

const s = await open('__rummy', { port: arg('port', 3018), width: 1200, height: 900 });

let g = await s.state();
console.log(`deck: ${g.deckSource}`);
const ink = await s.ink();
check('stage is drawn', ink.ink > 20, `${ink.size}, ${ink.ink}% ink, ${ink.colours} colours`);
check('ten cards each', g.yours === 10 && g.theirs === 10, `you ${g.yours}, them ${g.theirs}`);
check('one card is turned up', g.discard === 1, `discard ${g.discard}`);
check('the rest is stock', g.stock === 31, `stock ${g.stock}`);
check('all 52 cards are in play', await s.call('cardCount') === 52);
check('the solver ran', g.deadwood > 0 && g.deadwood <= 100, `deadwood ${g.deadwood}`);
await s.page.screenshot({ path: '/tmp/gr-deal.png' });

// Drawing from the stock must move exactly one card into your hand.
const before = await s.state();
await s.key('z');
g = await s.state();
check('drawing takes one card', g.yours === 11 && g.stock === before.stock - 1,
  `hand ${before.yours}->${g.yours}, stock ${before.stock}->${g.stock}`);
check('the phase moves to the discard', g.phase === 'discard', g.phase);

// Moving the cursor must stay inside the hand.
for (let i = 0; i < 14; i++) await s.key('ArrowRight', 40);
g = await s.state();
check('the cursor stays in the hand', g.cursor >= 0 && g.cursor < 11, `cursor ${g.cursor}`);

// Discarding must pass the turn, and the opponent must take it unprompted.
await s.key('z');
g = await s.state();
check('discarding passes the turn', g.yours === 10 && (g.turn === 'them' || !!g.result),
  `hand ${g.yours}, turn ${g.turn}`);
for (let i = 0; i < 30; i++) {
  const now = await s.state();
  if (now.turn === 'you' || now.result) break;
  await s.page.waitForTimeout(300);
}
g = await s.state();
check('the opponent plays unprompted', g.turn === 'you' || !!g.result,
  `turn ${g.turn}, result ${g.result?.ending ?? 'none'}`);
check('still 52 cards', await s.call('cardCount') === 52);

// A whole hand must end in a real ending, with the score to match.
const ending = await s.call('autoPlay');
g = await s.state();
check('a hand reaches an ending', ['knock', 'gin', 'undercut', 'wall'].includes(ending), ending);
check('the result is scored', g.result !== null
  && g.scores[g.result.winner] >= g.result.points,
  `${ending}: ${JSON.stringify(g.scores)}`);
check('both hands are shown', g.yours === 10 && g.theirs === 10,
  `you ${g.yours}, them ${g.theirs}`);
await s.page.screenshot({ path: '/tmp/gr-knock.png' });

// Ten hands must not stall, lose a card, or leave the match unscored.
let endings = {};
for (let i = 0; i < 10; i++) {
  await s.call('nextDeal');
  const e = await s.call('autoPlay');
  endings[e] = (endings[e] ?? 0) + 1;
  if (await s.call('cardCount') !== 52) break;
  if ((await s.state()).phase === 'match-over') break;
}
g = await s.state();
check('ten hands, no stalls', !endings.unfinished, JSON.stringify(endings));
check('still 52 cards after ten hands', await s.call('cardCount') === 52);
check('the match is progressing', g.scores.you + g.scores.them > 0, JSON.stringify(g.scores));

process.exit(finish(s) ? 1 : 0);
