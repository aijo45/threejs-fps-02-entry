// The DOM HUD: health, ammo, money, timer, score, kill feed, banners, the buy menu and
// the one overlay panel. It never touches the simulation; main.js pushes numbers in and
// reads the play and buy callbacks out. Every setter caches its last value so the DOM is
// only written when something changed.
import { WEAPONS } from './weapons.js';

const COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'A dusk compound, two bomb sites, four rivals. Plant the bomb at A or B, or drop every rival. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  dead: {
    title: 'You are down',
    copy: 'The rivals take the round.',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthBar = $('health-fill');
  const healthNum = $('health-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const roundLabel = $('round-label');
  const scoreYou = $('score-you');
  const scoreFoe = $('score-foe');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const plantWrap = $('plant-wrap');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buy = $('buy');
  const buyMoney = $('buy-money');
  const ammo = $('ammo');

  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastGrenades = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastBomb = '';
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(element, value, last) {
    if (value === last) return last;
    element.textContent = value;
    return value;
  }

  return {
    setAmmo(mag, reserve, weaponId, grenades) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        ammo.classList.toggle('empty', mag === 0);
      }
      if (weaponId !== lastWeapon) {
        lastWeapon = weaponId;
        weaponName.textContent = WEAPONS[weaponId].name;
      }
      if (grenades !== lastGrenades) {
        lastGrenades = grenades;
        grenadeCount.textContent = grenades > 0 ? `◉ ${grenades}` : '';
      }
    },
    setHealth(value) {
      const rounded = Math.max(0, Math.ceil(value));
      if (rounded === lastHealth) return;
      lastHealth = rounded;
      healthNum.textContent = String(rounded);
      healthBar.style.width = `${rounded}%`;
      healthBar.classList.toggle('low', rounded <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      const key = `${text}|${phase}`;
      if (key === lastTimer) return;
      lastTimer = key;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'live' && total <= 10);
      roundLabel.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND LIVE' : 'ROUND OVER';
    },
    setScore(you, foe, round) {
      const key = `${you}|${foe}|${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreYou.textContent = String(you);
      scoreFoe.textContent = String(foe);
      roundLabel.textContent = `ROUND ${round}`;
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('planted', text.length > 0);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    killfeedAdd(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    banner(titleText, subText, holdMs = 2200) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    showPlant(label, progress) {
      plantWrap.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() {
      plantWrap.hidden = true;
    },
    showBuy(money, owned) {
      buy.hidden = false;
      buyMoney.textContent = `$${money}`;
      for (const button of buy.querySelectorAll('[data-buy]')) {
        const id = button.dataset.buy;
        const ownedAlready = id === 'grenade' ? false : Boolean(owned[id]);
        const price = Number(button.dataset.price);
        button.classList.toggle('owned', ownedAlready);
        button.classList.toggle('poor', !ownedAlready && money < price);
        button.querySelector('.buy-state').textContent = ownedAlready ? 'OWNED' : `$${price}`;
      }
    },
    hideBuy() {
      buy.hidden = true;
    },
    isBuyOpen() {
      return !buy.hidden;
    },
    onBuy(handler) {
      buy.addEventListener('click', (event) => {
        const button = event.target.closest('[data-buy]');
        if (button) handler(button.dataset.buy);
      });
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? detail : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
