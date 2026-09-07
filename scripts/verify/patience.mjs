/** Headless check for examples/pixel-patience. See lib.mjs for how to run it. */
import { arg, check, finish, open } from './lib.mjs';

const s = await open('__patience', { port: arg('port', 3015) });

let g = await s.state();
console.log(`deck: ${g.deckSource}`);
const ink = await s.ink();
check('stage is drawn', ink.ink > 20, `${ink.size}, ${ink.ink}% ink, ${ink.colours} colours`);
check('the tableau is dealt', JSON.stringify(g.tableau) === '[1,2,3,4,5,6,7]',
  JSON.stringify(g.tableau));
check('twenty-four in the stock', g.stock === 24, `stock ${g.stock}`);
check('seven cards face up', g.faceUp === 7, `face up ${g.faceUp}`);
check('cards are drawn', g.visibleCards > 20, `${g.visibleCards} sprites`);
await s.page.screenshot({ path: '/tmp/pp-deal.png' });

// The stock must deal onto the waste.
for (let i = 0; i < 6; i++) await s.key('ArrowLeft');
g = await s.state();
check('the cursor reaches the stock', g.cursor === 0, `pile ${g.cursor}`);
const before = await s.state();
await s.key('z');
g = await s.state();
check('the stock deals', g.waste > before.waste && g.stock < before.stock,
  `stock ${before.stock}->${g.stock}, waste ${before.waste}->${g.waste}`);

// Walking the cursor must not run off the end.
for (let i = 0; i < 15; i++) await s.key('ArrowRight', 40);
g = await s.state();
check('the cursor stays in range', g.cursor >= 0 && g.cursor < 13, `pile ${g.cursor}`);

// Picking up and putting back must leave the board untouched.
await s.call('newGame');
await s.page.waitForTimeout(300);
const t0 = await s.state();
for (let i = 0; i < 6; i++) await s.key('ArrowRight', 40);
await s.key('z');
const held = await s.state();
await s.key('z');
const t1 = await s.state();
check('a pick-up can be put back', held.heldFrom >= 0 && t1.heldFrom < 0 && t1.moves === t0.moves,
  `moves ${t0.moves}->${t1.moves}`);

// The auto-finish must actually finish.
await s.call('stageAlmostWon');
await s.page.waitForTimeout(200);
await s.call('autoFinish');
for (let i = 0; i < 40 && !(await s.state()).won; i++) await s.page.waitForTimeout(120);
g = await s.state();
check('the game finishes itself', g.won === true,
  `foundations ${JSON.stringify(g.foundations)}`);
await s.page.screenshot({ path: '/tmp/pp-won.png' });

process.exit(finish(s) ? 1 : 0);
