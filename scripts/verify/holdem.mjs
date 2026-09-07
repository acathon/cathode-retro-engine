/** Headless check for examples/holdem. See lib.mjs for how to run it. */
import { arg, check, finish, open } from './lib.mjs';

const s = await open('__holdem', { port: arg('port', 3017), width: 1200, height: 900 });

let g = await s.state();
console.log(`deck: ${g.deckSource}`);
const ink = await s.ink();
check('stage is drawn', ink.ink > 20, `${ink.size}, ${ink.ink}% ink, ${ink.colours} colours`);
check('everyone starts even', new Set(g.stacks).size === 1, JSON.stringify(g.stacks));

await s.key('Enter');
await s.page.waitForTimeout(500);
g = await s.state();
const bank = (x) => x.stacks.reduce((a, b) => a + b, 0) + x.pot;
check('blinds are posted', g.pot === 15, `pot ${g.pot}`);
check('preflop starts', g.street === 'preflop', g.street);
check('somebody is to act', g.toAct >= 0, `seat ${g.toAct}`);
await s.page.screenshot({ path: '/tmp/ho-deal.png' });

// The bots must act on their own without the player touching anything.
for (let i = 0; i < 40; i++) {
  const now = await s.state();
  if (now.toAct === 0 || now.street === 'complete') break;
  await s.page.waitForTimeout(300);
}
g = await s.state();
check('bots act unprompted', g.toAct === 0 || g.street === 'complete',
  `street ${g.street}, toAct ${g.toAct}`);
check('the player is offered actions', g.street === 'complete' || !!g.legal,
  JSON.stringify(g.legal));

const before = await s.state();
const street = await s.call('autoPlay');
g = await s.state();
check('a hand plays to the end', street === 'complete', street);
check('the pot is awarded', g.awards.length > 0, JSON.stringify(g.awards));
check('chips are conserved', bank(g) === bank(before), `${bank(before)} -> ${bank(g)}`);
await s.page.screenshot({ path: '/tmp/ho-showdown.png' });

// Twenty hands must not stall, throw, or leak a chip.
const start = bank(await s.state());
let stalls = 0;
let rivers = 0;
for (let i = 0; i < 20; i++) {
  await s.call('deal');
  await s.page.waitForTimeout(50);
  if (await s.call('autoPlay') !== 'complete') stalls++;
  if ((await s.state()).board === 5) rivers++;
}
g = await s.state();
check('twenty hands, no stalls', stalls === 0, `${stalls} stalled`);
check('hands reach the river', rivers > 0, `${rivers}/20 ran out the board`);
check('chips still conserved', bank(g) === start, `${start} -> ${bank(g)}`);

process.exit(finish(s) ? 1 : 0);
