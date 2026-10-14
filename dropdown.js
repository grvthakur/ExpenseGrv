/* Expense Tracker dropdown repair
   Custom searchable UI for Expense Category and Credit Card only.
   Original select elements remain the source of truth for existing app logic. */
(function () {
  'use strict';
  const TARGETS = ['expenseCategory', 'cardSelect'];

  function initDropdown(select) {
    if (!select || select.dataset.etDropdownReady === '1') return;
    select.dataset.etDropdownReady = '1';

    const host = document.createElement('div');
    host.className = 'et-cd-host';
    host.style.width = '100%';
    select.parentNode.insertBefore(host, select);
    host.appendChild(select);
    select.classList.add('et-cd-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'et-cd-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="et-cd-value"></span><span class="et-cd-chevron" aria-hidden="true">⌄</span>';
    host.appendChild(trigger);

    const panel = document.createElement('div');
    panel.className = 'et-cd-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', select.id === 'expenseCategory' ? 'Choose category' : 'Choose credit card');
    panel.innerHTML = '<div class="et-cd-search-wrap"><span class="et-cd-search-icon" aria-hidden="true">⌕</span><input class="et-cd-search" type="search" autocomplete="off" placeholder="Search ' + (select.id === 'expenseCategory' ? 'category' : 'card') + '..." aria-label="Search options"></div><div class="et-cd-list" role="listbox"></div>';
    host.appendChild(panel);

    const value = trigger.querySelector('.et-cd-value');
    const search = panel.querySelector('.et-cd-search');
    const list = panel.querySelector('.et-cd-list');
    let activeIndex = -1;

    function options() {
      return Array.from(select.options).filter(o => !o.disabled && (o.value !== '' || o.textContent.trim()));
    }
    function selectedText() {
      const opt = select.options[select.selectedIndex];
      return opt ? opt.textContent.trim() : (select.id === 'expenseCategory' ? 'Select category' : 'Select credit card');
    }
    function syncValue() { value.textContent = selectedText(); }

    function render() {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = options().filter(o => (o.textContent + ' ' + o.value).toLocaleLowerCase().includes(query));
      list.replaceChildren();
      activeIndex = -1;
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'et-cd-empty';
        empty.textContent = 'No matching options';
        list.appendChild(empty);
        return;
      }
      filtered.forEach((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'et-cd-option' + (option.value === select.value ? ' is-selected' : '');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', option.value === select.value ? 'true' : 'false');
        const label = document.createElement('span');
        label.textContent = option.textContent.trim();
        const check = document.createElement('span');
        check.className = 'et-cd-check';
        check.textContent = '✓';
        item.append(label, check);
        item.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          syncValue();
          close();
          trigger.focus({ preventScroll: true });
        });
        list.appendChild(item);
      });
    }
    function open() {
      closeOthers();
      render();
      panel.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      host.classList.add('is-open');
      search.value = '';
      render();
      requestAnimationFrame(() => search.focus({ preventScroll: true }));
    }
    function close() {
      panel.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      host.classList.remove('is-open');
    }
    function closeOthers() {
      document.querySelectorAll('.et-cd-host.is-open').forEach(other => {
        if (other !== host) {
          other.classList.remove('is-open');
          other.querySelector('.et-cd-panel')?.classList.remove('is-open');
          other.querySelector('.et-cd-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    trigger.addEventListener('click', () => panel.classList.contains('is-open') ? close() : open());
    search.addEventListener('input', render);
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.et-cd-option')?.focus(); }
    });
    trigger.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
    });
    document.addEventListener('pointerdown', e => {
      if (!host.contains(e.target)) close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    select.addEventListener('change', syncValue);
    new MutationObserver(() => { syncValue(); if (panel.classList.contains('is-open')) render(); })
      .observe(select, { childList: true, subtree: true, attributes: true });
    syncValue();
  }

  function boot() {
    TARGETS.forEach(id => initDropdown(document.getElementById(id)));
    // Card options may be populated after initial page setup.
    const card = document.getElementById('cardSelect');
    if (card && card.dataset.etDropdownReady !== '1') initDropdown(card);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
