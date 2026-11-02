/* SleepSphere Meditation chooser. Add a deferred script after explore.js to enable.
   Uses existing SSExplore practices. Does not read or write participant data. */
(function () {
  'use strict';
  const ACTIONS = {
    'body-scan': 'Body scan',
    'gentle-breathing': 'Breathing',
    'gratitude-reflection': 'Gratitude'
  };
  const FALLBACK = [
    { title: 'Deep Sleep', description: 'Settle into rest', session_ids: ['body-scan'] },
    { title: 'Body Relaxation', description: 'Release physical tension', session_ids: ['body-scan'] },
    { title: 'Calm', description: 'Settle busy thoughts', session_ids: ['gentle-breathing'] },
    { title: 'Breathwork', description: 'Follow an easy breath rhythm', session_ids: ['gentle-breathing'] },
    { title: 'Gratitude', description: 'Notice moments worth remembering', session_ids: ['gratitude-reflection'] }
  ];
  const TITLES = {
    'body-scan': 'Body Scan',
    'gentle-breathing': 'Gentle Breathing',
    'gratitude-reflection': 'Gratitude Reflection'
  };
  const node = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function open() {
    const overlay = node('div');
    overlay.className = 'ex-layer ss-meditation';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Meditation');
    const bar = node('div'); bar.className = 'ex-bar';
    const close = node('button', 'Close'); close.type = 'button';
    close.className = 'ex-close';
    const title = node('span', 'Meditation'); title.className = 'ex-bar-title';
    bar.append(close, title);
    const body = node('div'); body.className = 'ex-body';
    const dismiss = () => { overlay.remove(); document.documentElement.classList.remove('ex-open'); };
    close.addEventListener('click', dismiss);
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') dismiss(); });
    overlay.append(bar, body);
    document.body.appendChild(overlay);
    document.documentElement.classList.add('ex-open');
    close.focus();

    function render(categories, sessions) {
      if (!overlay.isConnected) return;
      body.replaceChildren();
      const note = node('p', 'Choose a guided on-screen practice. Recorded narration is not available yet.');
      note.className = 'ex-note'; body.appendChild(note);
      categories.forEach(category => {
        const available = category.session_ids.filter(id =>
          ACTIONS[id] && sessions.some(s => s.id === id && s.status !== 'planned'));
        if (!available.length) return;
        const card = node('section'); card.className = 'ex-card';
        card.appendChild(node('h2', category.title));
        const description = node('p', category.description); description.className = 'ex-note';
        card.appendChild(description);
        const choices = node('div'); choices.className = 'ex-grid';
        available.forEach(id => {
          const button = node('button');
          button.type = 'button'; button.className = 'ex-tile';
          button.appendChild(node('strong', TITLES[id]));
          button.addEventListener('click', () => {
            dismiss();
            if (window.SSExplore && typeof window.SSExplore.open === 'function') {
              window.SSExplore.open(ACTIONS[id]);
            }
          });
          choices.appendChild(button);
        });
        card.appendChild(choices); body.appendChild(card);
      });
    }
    const fallbackSessions = Object.keys(ACTIONS).map(id => ({
      id, status: 'existing'
    }));
    render(FALLBACK, fallbackSessions);
    if (typeof fetch === 'function') {
      fetch('meditation-catalog.json').then(response => {
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      }).then(catalog => {
        if (catalog && Array.isArray(catalog.categories) && Array.isArray(catalog.sessions)) {
          render(catalog.categories, catalog.sessions);
        }
      }).catch(() => { /* Keep the offline choices. */ });
    }
  }
  function mount() {
    const grid = document.querySelector('#explore .ex-grid');
    if (!grid || document.getElementById('ss-meditation-entry')) return false;
    const button = node('button');
    button.type = 'button'; button.className = 'ex-tile'; button.id = 'ss-meditation-entry';
    button.appendChild(node('strong', 'Meditation'));
    button.appendChild(node('span', 'Sleep, body relaxation, breathing and gratitude.'));
    button.addEventListener('click', open);
    grid.insertBefore(button, grid.firstChild);
    return true;
  }
  function init() {
    if (mount()) return;
    let tries = 0;
    const retry = setInterval(() => { if (mount() || ++tries >= 20) clearInterval(retry); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.SSMeditation = { open, mount };
})();
