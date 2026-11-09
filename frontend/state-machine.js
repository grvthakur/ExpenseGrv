/**
 * App State Machine (ASM) - Universal Reactive Controller
 * Elevates UX (mutual exclusion, double-submit protection, modal stack),
 * DX (single source of truth, reactive events, universal form cancel),
 * and AX (Agent Experience - single-call inspection and action dispatching).
 *
 * Zero-breaking: wraps and synchronizes seamlessly with legacy globals.
 */
(function (global) {
  'use strict';

  class AppStateMachine {
    constructor() {
      this._subscribers = new Set();
      this._cancelling = false;
      this.state = {
        workspace: 'expenses', // expenses | cards | grvcc | sweetie | loans
        form: {
          mode: 'IDLE', // IDLE | EDITING | CLONING | SUBMITTING
          domain: null, // expense | card | sweetie | grvCard | loan
          targetId: null,
          isBusy: false,
          data: null,
        },
        sync: {
          status: 'READY', // UNINITIALIZED | SYNCING | READY | ERROR | OFFLINE
          activeJobs: new Set(),
          lastSynced: null,
          lastError: null,
        },
        modals: [], // Stack of currently open modal element IDs
        selection: {
          domain: null,
          selectedIds: new Set(),
        },
        privacy: {
          masked: false,
        },
      };

      this._setupKeyboardGuards();
      this._setupAutoInit();
    }

    /* -------------------------------------------------------------
     * 1. Subscriptions & Event Hub (DX)
     * ------------------------------------------------------------- */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      this._subscribers.add(fn);
      return () => this._subscribers.delete(fn);
    }

    _emit(event, data) {
      for (const fn of this._subscribers) {
        try {
          fn(event, data, this.state);
        } catch (e) {
          console.error('[ASM] Subscriber error:', e);
        }
      }
    }

    /* -------------------------------------------------------------
     * 2. Transaction Form Lifecycle (UX & DX)
     * Guarantees Mutual Exclusion: starting an edit in any domain
     * automatically cancels leftover edits in all other domains.
     * ------------------------------------------------------------- */
    startEdit(domain, id, data = {}) {
      this.cancelAllForms({ silent: true, exceptDomain: domain });
      this.state.form = {
        mode: 'EDITING',
        domain,
        targetId: String(id),
        isBusy: false,
        data,
      };

      this._syncLegacyGlobals();
      this._emit('form:startEdit', this.state.form);
      return this.state.form;
    }

    startClone(domain, id, data = {}) {
      this.cancelAllForms({ silent: true, exceptDomain: domain });
      this.state.form = {
        mode: 'CLONING',
        domain,
        targetId: String(id),
        isBusy: false,
        data,
      };
      this._syncLegacyGlobals();
      this._emit('form:startClone', this.state.form);
      return this.state.form;
    }

    cancelAllForms(opts = {}) {
      if (this._cancelling) return;
      this._cancelling = true;

      const prev = { ...this.state.form };
      this.state.form = {
        mode: 'IDLE',
        domain: null,
        targetId: null,
        isBusy: false,
        data: null,
      };

      const except = opts.exceptDomain || null;

      try {
        // Reset legacy globals and trigger UI reset where appropriate
        if (except !== 'expense') {
          global.editingExpId = null;
          if (typeof global.cancelEditExpense === 'function') {
            try { global.cancelEditExpense(); } catch (_) {}
          }
        }
        if (except !== 'card') {
          global.editingCardId = null;
          if (typeof global.cancelEditCard === 'function') {
            try { global.cancelEditCard(); } catch (_) {}
          }
        }
        if (except !== 'sweetie') {
          global.editingSweetieId = null;
          if (typeof global.cancelEditSweetie === 'function') {
            try { global.cancelEditSweetie(); } catch (_) {}
          }
        }
        if (except !== 'grvCard') {
          global.editingGrvCardKey = null;
        }
        if (except !== 'loan') {
          global.editId = null;
        }
        global.__addBusy = false;
      } finally {
        this._cancelling = false;
      }

      if (!opts.silent && prev.mode !== 'IDLE') {
        this._emit('form:cancelled', prev);
      }
      return prev;
    }

    _syncLegacyGlobals() {
      const { domain, targetId } = this.state.form;
      if (domain === 'expense') global.editingExpId = targetId;
      if (domain === 'card') global.editingCardId = targetId;
      if (domain === 'sweetie') global.editingSweetieId = targetId;
    }

    /**
     * Prevents double-submissions on slow networks.
     * True promise-aware locking.
     */
    async runExclusive(taskKey, asyncFn) {
      if (this.state.form.isBusy) {
        console.warn(`[ASM] Blocked concurrent submission for: ${taskKey}`);
        return false;
      }
      this.state.form.isBusy = true;
      global.__addBusy = true;
      this._emit('form:submitting', { taskKey });

      try {
        const result = await asyncFn();
        this.state.form.isBusy = false;
        global.__addBusy = false;
        this.cancelAllForms({ silent: true });
        this._emit('form:submitted', { taskKey, success: true, result });
        return result;
      } catch (err) {
        this.state.form.isBusy = false;
        global.__addBusy = false;
        this._emit('form:submitted', { taskKey, success: false, error: err });
        throw err;
      }
    }

    canSubmit() {
      return !this.state.form.isBusy;
    }

    /* -------------------------------------------------------------
     * 3. Sync & Network Coordination
     * ------------------------------------------------------------- */
    startSync(jobKey) {
      this.state.sync.activeJobs.add(jobKey);
      this.state.sync.status = 'SYNCING';
      this._emit('sync:started', { jobKey, activeJobs: [...this.state.sync.activeJobs] });
    }

    finishSync(jobKey, err = null) {
      this.state.sync.activeJobs.delete(jobKey);
      if (err) {
        this.state.sync.lastError = err;
        this.state.sync.status = this.state.sync.activeJobs.size > 0 ? 'SYNCING' : 'ERROR';
      } else {
        this.state.sync.lastSynced = new Date();
        this.state.sync.status = this.state.sync.activeJobs.size > 0 ? 'SYNCING' : 'READY';
      }
      this._emit('sync:finished', { jobKey, err, status: this.state.sync.status });
    }

    /* -------------------------------------------------------------
     * 4. Modal Stack Management (UX)
     * Handles z-indexing and Escape key cleanly
     * ------------------------------------------------------------- */
    pushModal(modalId) {
      if (!this.state.modals.includes(modalId)) {
        this.state.modals.push(modalId);
      }
      const el = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
      if (el) el.style.display = 'block';
      this._emit('modal:pushed', { modalId, stack: [...this.state.modals] });
    }

    popModal() {
      const modalId = this.state.modals.pop();
      if (modalId) {
        const el = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
        if (el) el.style.display = 'none';
        this._emit('modal:popped', { modalId, stack: [...this.state.modals] });
      }
      return modalId;
    }

    closeModal(modalId) {
      const idx = this.state.modals.indexOf(modalId);
      if (idx !== -1) {
        this.state.modals.splice(idx, 1);
      }
      const el = typeof document !== 'undefined' ? document.getElementById(modalId) : null;
      if (el) el.style.display = 'none';
      this._emit('modal:closed', { modalId, stack: [...this.state.modals] });
    }

    _setupKeyboardGuards() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.state.modals.length > 0) {
          e.preventDefault();
          this.popModal();
        }
      });
    }

    _setupAutoInit() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      // Auto-sync initial privacy state
      try {
        if (localStorage.getItem('grv_amounts_masked') === 'true') {
          this.state.privacy.masked = true;
        }
      } catch (_) {}
    }

    /* -------------------------------------------------------------
     * 5. Workspace Navigation
     * ------------------------------------------------------------- */
    setWorkspace(tab) {
      const prev = this.state.workspace;
      this.state.workspace = tab;
      if (typeof global.activeTab !== 'undefined') global.activeTab = tab;
      this._emit('workspace:changed', { from: prev, to: tab });
    }

    /* -------------------------------------------------------------
     * 6. Agent Experience (AX) & Inspection API
     * Provides an instant snapshot of the app state for AI Assistants.
     * ------------------------------------------------------------- */
    inspect() {
      return {
        workspace: this.state.workspace,
        form: {
          mode: this.state.form.mode,
          domain: this.state.form.domain,
          targetId: this.state.form.targetId,
          isBusy: this.state.form.isBusy,
        },
        sync: {
          status: this.state.sync.status,
          activeJobsCount: this.state.sync.activeJobs.size,
          lastSynced: this.state.sync.lastSynced ? this.state.sync.lastSynced.toISOString() : null,
          lastError: this.state.sync.lastError,
        },
        openModals: [...this.state.modals],
        topModal: this.state.modals[this.state.modals.length - 1] || null,
        amountsMasked:
          typeof document !== 'undefined' &&
          document.body &&
          document.body.classList.contains('amounts-masked'),
      };
    }

    dispatch(action, payload) {
      switch (action) {
        case 'NAVIGATE':
          this.setWorkspace(payload);
          if (typeof global.switchTab === 'function') global.switchTab(payload);
          break;
        case 'CANCEL_FORMS':
          this.cancelAllForms();
          break;
        case 'CLOSE_TOP_MODAL':
          this.popModal();
          break;
        case 'START_EDIT':
          if (payload && payload.domain && payload.id) {
            this.startEdit(payload.domain, payload.id, payload.data);
          }
          break;
        default:
          console.warn('[ASM] Unknown dispatch action:', action);
      }
      return this.inspect();
    }
  }

  // Export singleton instance
  const asm = new AppStateMachine();
  global.__asm = asm;
  global.AppState = asm;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = asm;
  }
})(typeof window !== 'undefined' ? window : globalThis);
