// The match, in one place: rounds, phases, money and the score. It owns numbers only —
// main.js owns the player, the bots and the bomb, and applies the transitions this
// module reports. First to WIN_ROUNDS rounds takes the match.
export const WIN_ROUNDS = 5;
export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const END_TIME = 4;
export const REWARD_WIN = 3250;
export const REWARD_LOSS = 1900;
export const REWARD_KILL = 300;
export const REWARD_PLANT = 300;

export function createGame() {
  const state = {
    phase: 'menu',
    round: 1,
    wins: 0,
    losses: 0,
    kills: 0,
    money: 800,
    roundTimer: 0,
    buyTimer: 0,
    endTimer: 0,
    endReason: '',
    matchWinner: null,
  };

  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.wins = 0;
    state.losses = 0;
    state.kills = 0;
    state.money = 800;
    state.buyTimer = BUY_TIME;
    state.roundTimer = 0;
    state.endReason = '';
    state.matchWinner = null;
  }

  function startRound() {
    state.phase = 'buy';
    state.buyTimer = BUY_TIME;
    state.roundTimer = 0;
    state.endReason = '';
  }

  // Reports the next transition, or null: main.js applies it.
  function tick(dt) {
    if (state.phase === 'buy') {
      state.buyTimer -= dt;
      if (state.buyTimer <= 0) {
        state.phase = 'live';
        state.roundTimer = ROUND_TIME;
        return { type: 'buyEnd' };
      }
    } else if (state.phase === 'live') {
      state.roundTimer -= dt;
      if (state.roundTimer <= 0) {
        endRound(false, 'Time expired — the rivals hold the sites.');
        return { type: 'roundEnd' };
      }
    } else if (state.phase === 'roundEnd') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) {
        if (state.matchWinner) return { type: 'matchEnd' };
        state.round += 1;
        startRound();
        return { type: 'nextRound' };
      }
    }
    return null;
  }

  function endRound(won, reason) {
    if (state.phase !== 'live' && state.phase !== 'buy') return;
    state.phase = 'roundEnd';
    state.endTimer = END_TIME;
    state.endReason = reason;
    if (won) {
      state.wins += 1;
      state.money += REWARD_WIN;
      if (state.wins >= WIN_ROUNDS) state.matchWinner = 'you';
    } else {
      state.losses += 1;
      state.money += REWARD_LOSS;
      if (state.losses >= WIN_ROUNDS) state.matchWinner = 'rivals';
    }
  }

  function addKill() {
    state.kills += 1;
    state.money += REWARD_KILL;
  }

  function addPlant() {
    state.money += REWARD_PLANT;
  }

  return { state, startMatch, startRound, tick, endRound, addKill, addPlant };
}
