/** Headless check for examples/blackjack. See lib.mjs for how to run it. */
import { arg, check, finish, open } from './lib.mjs';

const s = await open('__blackjack', { port: arg('port', 3016) });

const settle = async (max = 60) => {
  for (let i = 0; i < max; i++) {
    const now = await s.state();
    if (now.phase === 'payout') return now;
    await s.page.waitForTimeout(120);
  }
  return s.state();
};

let g = await s.state();
console.log(`deck: ${g.deckSource}`);
const ink = await s.ink();
check('stage is drawn', ink.ink > 20, `${ink.size}, ${ink.ink}% ink, ${ink.colours} colours`);
check('the shoe is six decks', g.shoe === 312, `${g.shoe} cards`);
check('betting comes first', g.phase === 'betting', g.phase);

const bet0 = g.bet;
await s.key('ArrowRight');
await s.key('ArrowRight');
g = await s.state();
check('the bet can be raised', g.bet > bet0, `${bet0} -> ${g.bet}`);

await s.key('z');
g = await s.state();
check('two cards each', g.dealer.length === 2 && g.hands[0]?.cards === 2,
  `dealer ${g.dealer.length}, player ${g.hands[0]?.cards}`);
check('the round starts', ['insurance', 'player', 'payout'].includes(g.phase), g.phase);
await s.page.screenshot({ path: '/tmp/bj-deal.png' });

if ((await s.state()).phase === 'insurance') await s.key('x');
if ((await s.state()).phase === 'player') await s.key('x');
g = await settle();
check('standing reaches a payout', g.phase === 'payout', g.phase);
await s.page.screenshot({ path: '/tmp/bj-settle.png' });

/*
 * The next two were assertions about a live deal, and both were wrong about
 * one hand in twenty. A natural pays out inside the deal, so the stake is not
 * simply gone from the stack; and a natural means the dealer never draws, so
 * their total can be anything. Both are staged now: 10-8 against a dealer 11,
 * which cannot be a blackjack either way.
 */
await s.call('stage', [[0, 4], [0, 5]], [[1, 9], [2, 7]], 100);
await s.page.waitForTimeout(120);
g = await s.state();
check('the deal takes the stake', g.chips === 400 && g.atStake === 100,
  `chips ${g.chips}, at stake ${g.atStake}`);

await s.call('stand');
g = await settle();
check('the dealer draws to seventeen', g.dealerTotal >= 17,
  `dealer 11 -> ${g.dealerTotal}`);

// A staged blackjack must pay three to two: 100 staked returns 250.
await s.call('stage', [[0, 9], [0, 6]], [[1, 0], [2, 12]], 100);
await s.page.waitForTimeout(120);
const preBj = await s.state();
await s.call('stand');
g = await settle();
check('a blackjack pays 3:2', g.chips - preBj.chips === 250,
  `${preBj.chips} -> ${g.chips} (${JSON.stringify(g.results)})`);

// A staged bust must lose the stake, and the dealer must not draw.
await s.call('stage', [[0, 9], [0, 6]], [[1, 12], [2, 11]], 100);
await s.page.waitForTimeout(120);
const preBust = await s.state();
await s.call('hit');
g = await settle();
check('a bust loses the stake', g.chips === preBust.chips && g.results[0] === 'bust',
  `${preBust.chips} -> ${g.chips} (${JSON.stringify(g.results)})`);
check('the dealer stands pat on a bust', g.dealer.length === 2, `${g.dealer.length} cards`);

await s.key('Enter');
g = await s.state();
check('the next hand can be dealt', g.phase === 'betting', g.phase);

process.exit(finish(s) ? 1 : 0);
