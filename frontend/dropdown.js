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
    function getBottomNavHeight() {
      const bottomNav = document.querySelector('.tab-bar');
      if (!bottomNav) return 0;
      const comp = window.getComputedStyle(bottomNav);
      if (comp.display === 'none' || comp.visibility === 'hidden') return 0;
      const navRect = bottomNav.getBoundingClientRect();
      const vh = window.innerHeight;
      if (navRect.top < vh && navRect.bottom > 0) {
        return Math.max(0, vh - navRect.top);
      }
      return 0;
    }

    function computePosition() {
      if (!panel.classList.contains('is-open')) return;
      const triggerRect = trigger.getBoundingClientRect();
      const vh = window.innerHeight;

      if (triggerRect.bottom < 0 || triggerRect.top > vh) {
        close();
        return;
      }

      const bottomNavHeight = getBottomNavHeight();
      const safeBottom = vh - bottomNavHeight - 8;
      const spaceBelow = safeBottom - triggerRect.bottom;
      const spaceAbove = triggerRect.top - 8;

      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

      if (openUp) {
        panel.classList.add('is-up');
        panel.classList.remove('is-down');
        panel.style.top = 'auto';
        panel.style.bottom = 'calc(100% + 6px)';
        const maxPanel = Math.max(140, Math.min(360, spaceAbove));
        panel.style.maxHeight = maxPanel + 'px';
        list.style.maxHeight = Math.max(80, maxPanel - 55) + 'px';
      } else {
        panel.classList.remove('is-up');
        panel.classList.add('is-down');
        panel.style.top = 'calc(100% + 6px)';
        panel.style.bottom = 'auto';
        const maxPanel = Math.max(140, Math.min(360, spaceBelow));
        panel.style.maxHeight = maxPanel + 'px';
        list.style.maxHeight = Math.max(80, maxPanel - 55) + 'px';
      }
    }

    function onViewportChange() {
      computePosition();
    }

    function onScroll(e) {
      if (panel.contains(e.target)) return;
      computePosition();
    }

    function open() {
      closeOthers();
      render();
      panel.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      host.classList.add('is-open');
      search.value = '';
      render();
      computePosition();
      requestAnimationFrame(() => {
        computePosition();
        search.focus({ preventScroll: true });
      });
      window.addEventListener('resize', onViewportChange);
      window.addEventListener('orientationchange', onViewportChange);
      window.addEventListener('scroll', onScroll, true);
    }
    function close() {
      panel.classList.remove('is-open', 'is-up', 'is-down');
      trigger.setAttribute('aria-expanded', 'false');
      host.classList.remove('is-open');
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.maxHeight = '';
      list.style.maxHeight = '';
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.removeEventListener('scroll', onScroll, true);
    }
    function closeOthers() {
      document.querySelectorAll('.et-cd-host.is-open').forEach(other => {
        if (other !== host) {
          other.classList.remove('is-open');
          other.querySelector('.et-cd-panel')?.classList.remove('is-open', 'is-up', 'is-down');
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
    list.addEventListener('keydown', e => {
      const options = Array.from(list.querySelectorAll('.et-cd-option'));
      const currentIndex = options.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = options[currentIndex + 1] || options[0];
        next?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex <= 0) {
          search.focus();
        } else {
          options[currentIndex - 1]?.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      }
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
