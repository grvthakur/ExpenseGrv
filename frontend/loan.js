/* Loans module. Requires the app's existing apiUrl, enc, esc, money and toast helpers. */
(function () {
  'use strict';
  if (window.__grvLoansLoaded) return;
  window.__grvLoansLoaded = true;

  const $ = (id) => document.getElementById(id);
  let loans = [];
  let editId = null;
  let busy = false;
  let paymentLoan = null;
  const CACHE_KEY = 'grv_loans_cache_v1';
  let loadSequence = 0;
  let hasLoadedOnce = false;

  function readLoanCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  }
  function writeLoanCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(loans)); } catch (_) {}
  }

  const overlay = document.createElement('div');
  overlay.className = 'ln-ov';
  overlay.id = 'lnOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <section class="ln-box" role="dialog" aria-modal="true" aria-labelledby="lnTitle">
      <button class="ln-x" id="lnX" type="button" aria-label="Close">×</button>
      <h2 id="lnTitle" class="ln-title">🤝 Loans</h2>
      <div class="ln-tot" id="lnTot">Pending ₹0</div>
      <div class="ln-chips" id="lnChips"></div>
      <form class="ln-form" id="lnForm">
        <label class="ln-field"><span>Person / Borrower</span><input id="lnP" maxlength="100" placeholder="e.g. Tanya" required></label>
        <label class="ln-field"><span>Given date</span><input id="lnD" type="date" title="Date you gave the money" required></label>
        <label class="ln-field"><span>Loan amount (₹)</span><input id="lnA" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="e.g. 10000" required></label>
        <label class="ln-field"><span>Expected return date (optional)</span><input id="lnE" type="date" title="Expected date to receive the money"></label>
        <label class="ln-field"><span>Note (optional)</span><input id="lnN" maxlength="500" placeholder="Purpose / details"></label>
        <div class="ln-form-actions">
          <button class="btn btn-primary" id="lnS" type="submit"><span class="ln-btn-icon">➕</span><span class="ln-btn-label">Add loan</span></button>
          <button class="btn btn-secondary" id="lnCancelEdit" type="button" hidden>Cancel edit</button>
        </div>
      </form>
      <div class="ln-tw"><table><thead><tr><th>Person</th><th>Given</th><th>Expected</th><th>Note</th><th>Amount</th><th>Returned</th><th>Pending</th><th>Status</th><th>Actions</th></tr></thead><tbody id="lnB"></tbody></table></div>
      <div class="ln-pay" id="lnPay" hidden>
        <div class="ln-pay-card" role="dialog" aria-modal="true" aria-labelledby="lnPayTitle">
          <button class="ln-x ln-pay-x" id="lnPayX" type="button" aria-label="Close payment dialog">×</button>
          <h3 id="lnPayTitle">Record payment</h3>
          <p id="lnPayInfo"></p>
          <label for="lnPayAmount">Amount received (₹)</label>
          <input id="lnPayAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Enter amount">
          <div class="ln-pay-preview" id="lnPayPreview"></div>
          <div class="ln-pay-actions"><button class="btn btn-secondary" id="lnPayCancel" type="button">Cancel</button><button class="btn btn-primary" id="lnPaySave" type="button">Save payment</button></div>
        </div>
      </div>
    </section>`;
  document.body.append(overlay);

  function displayDate(value) {
    if (!value) return '—';
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
    if (!match) return esc(value);
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return `${date.getDate()} ${date.toLocaleString('en-IN', { month: 'short' })} ${date.getFullYear()}`;
  }

  const localToday = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const close = () => {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    closePayment();
  };
  const closePayment = () => {
    $('lnPay').hidden = true;
    paymentLoan = null;
    $('lnPayAmount').value = '';
  };
  const validAmount = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
  const formatMoney = (v) => money(Number(v) || 0);

  async function request(action, params = {}) {
    const query = new URLSearchParams({ action, ...params });
    const response = await fetch(apiUrl(query.toString()), { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`Server error (${response.status})`);
    const body = (await response.text()).trim();
    if (!body || /^ERROR\s*:/i.test(body) || /^NotFound$/i.test(body)) throw new Error(body || 'Empty server response');
    return body;
  }

  async function load({ silent = true } = {}) {
    const sequence = ++loadSequence;
    try {
      const response = await fetch(apiUrl('action=getLoans'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Server error (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid loans response');
      // Ignore stale reads that started before a newer refresh.
      if (sequence !== loadSequence) return;
      loans = data.map((r) => ({
        id: String(r[0] ?? ''), person: String(r[1] ?? ''), date: String(r[2] ?? ''),
        amount: Number(r[3]) || 0, returned: Number(r[4]) || 0,
        pending: Math.max(0, Number(r[5]) || 0), status: String(r[6] ?? ''),
        note: String(r[7] ?? ''), expected: String(r[8] ?? '')
      }));
      hasLoadedOnce = true;
      writeLoanCache();
      draw();
    } catch (err) {
      if (!silent) toast(`Loans load failed: ${err.message}`, true);
    }
  }

  function draw() {
    const byPerson = {};
    const pendingTotal = loans.reduce((sum, r) => sum + r.pending, 0);
    loans.forEach((r) => { if (r.pending > 0) byPerson[r.person] = (byPerson[r.person] || 0) + r.pending; });
    $('lnTot').textContent = `Pending ${formatMoney(pendingTotal)}`;
    $('lnChips').innerHTML = Object.entries(byPerson).map(([name, amount]) => `<span>${esc(name)}: ${formatMoney(amount)}</span>`).join('') || '<span>No pending loans</span>';
    window.__lnNames = [...new Set(loans.map((r) => r.person).filter(Boolean))];
    $('lnB').innerHTML = loans.map((r, i) => ({ r, i })).sort((a, b) => String(b.r.date || '').localeCompare(String(a.r.date || '')) || b.i - a.i).map((x) => x.r).map((r) => {
      const overdue = r.pending > 0 && r.expected && r.expected < localToday();
      const actions = r.pending > 0
        ? `<button class="ln-action ln-paid" data-a="paid" data-i="${esc(r.id)}" type="button" title="Mark full pending amount as paid">✓ Paid</button><button class="ln-action" data-a="partial" data-i="${esc(r.id)}" type="button" title="Record partial payment">↩ Partial</button>`
        : '<span class="ln-done">✓ Paid</span>';
      const statusClass = r.pending <= 0 ? 'ln-status-cleared' : (r.returned > 0 ? 'ln-status-partial' : (overdue ? 'ln-status-overdue' : 'ln-status-pending'));
      const statusLabel = r.pending <= 0 ? 'PAID' : (r.returned > 0 ? 'PARTIAL' : (overdue ? 'OVERDUE' : 'PENDING'));
      return `<tr class="${[overdue ? 'ln-od' : '', r.pending <= 0 ? 'ln-cleared' : ''].filter(Boolean).join(' ')}"><td data-label="Person"><span class="ln-cell ln-person" title="${esc(r.person)}">${esc(r.person)}</span><small class="ln-sub">${displayDate(r.date).replace(/-(\d\d)(\d\d)$/,'-$2')}${r.expected ? '<br><span class="ln-due">Due ' + displayDate(r.expected).replace(/-(\d\d)(\d\d)$/,'-$2') + '</span>' : ''}</small></td><td data-label="Given"><span class="ln-cell ln-date">${displayDate(r.date)}</span></td><td data-label="Expected"><span class="ln-cell ln-expected">${displayDate(r.expected)}</span></td><td data-label="Note"><span class="ln-cell ln-note-pill" title="${esc(r.note || '')}">${esc(r.note || '—')}</span></td><td data-label="Amount"><span class="ln-cell ln-money">${formatMoney(r.amount).replace(/\.00$/,'<i class="ln-dec">.00</i>')}</span></td><td data-label="Returned"><span class="ln-cell ln-returned">${formatMoney(r.returned).replace(/\.00$/,'<i class="ln-dec">.00</i>')}</span></td><td data-label="Pending"><span class="ln-cell ln-pending">${formatMoney(r.pending).replace(/\.00$/,'<i class="ln-dec">.00</i>')}</span></td><td data-label="Status"><span class="ln-status ${statusClass}">${statusLabel}</span></td><td data-label="Actions" class="ln-actions"><button class="ln-dots" type="button" aria-label="More actions">⋮</button><span class="ln-menu">${actions}<button class="ln-b" data-a="edit" data-i="${esc(r.id)}" type="button" title="Edit loan" aria-label="Edit loan">✏️</button><button class="ln-b ln-delete" data-a="delete" data-i="${esc(r.id)}" type="button" title="Delete loan" aria-label="Delete loan">🗑</button></span></td></tr>${r.note ? `<tr class="ln-noterow"><td colspan="6">📝 ${esc(r.note)}</td></tr>` : ''}`;
    }).join('') || '<tr><td colspan="9" class="ln-empty">No loans yet</td></tr>';
  }

  function resetForm() {
    editId = null;
    ['lnP', 'lnA', 'lnE', 'lnN'].forEach((id) => { $(id).value = ''; });
    $('lnD').value = localToday();
    $('lnS').innerHTML = '<span class="ln-btn-icon">➕</span><span class="ln-btn-label">Add loan</span>';
    $('lnCancelEdit').hidden = true;
    $('lnTitle').textContent = '🤝 Loans';
  }

  $('lnCancelEdit').addEventListener('click', resetForm);
  function setBusy(value) {
    busy = value;
    $('lnS').disabled = value;
    $('lnPaySave').disabled = value;
  }

  $('lnForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const person = $('lnP').value.trim();
    const amount = Number($('lnA').value);
    const date = $('lnD').value;
    if (!person || !date || !validAmount(amount)) return toast('Person, given date aur positive amount required hai', true);
    const isEdit = Boolean(editId);
    const id = editId || String(Date.now());
    const params = {
      person, date, amount: String(amount), expected: $('lnE').value,
      note: $('lnN').value.trim(), id
    };
    const previous = isEdit ? loans.find((r) => r.id === id) : null;
    const optimistic = {
      id, person, date, amount, returned: previous ? previous.returned : 0,
      pending: Math.max(0, amount - (previous ? previous.returned : 0)),
      status: amount <= (previous ? previous.returned : 0) ? 'CLEARED' : (previous && previous.returned > 0 ? 'PARTIAL' : 'PENDING'),
      note: params.note, expected: params.expected
    };
    // Invalidate any older background read before applying this optimistic change.
    ++loadSequence;
    // Render immediately; do not wait for another read from Google Sheets.
    if (isEdit) loans = loans.map((r) => r.id === id ? optimistic : r);
    else loans.push(optimistic);
    draw();
    writeLoanCache();
    resetForm();
    setBusy(true);
    try {
      await request(isEdit ? 'updateLoan' : 'addLoan', params);
      toast(isEdit ? 'Loan updated ✓' : 'Loan added ✓');
      load(); // silent background reconciliation
    } catch (err) {
      if (isEdit && previous) loans = loans.map((r) => r.id === id ? previous : r);
      else loans = loans.filter((r) => r.id !== id);
      draw();
      writeLoanCache();
      toast(`Save failed: ${err.message}`, true);
      if (isEdit) {
        editId = id;
        $('lnP').value = params.person; $('lnD').value = params.date;
        $('lnA').value = params.amount; $('lnE').value = params.expected; $('lnN').value = params.note;
        $('lnS').innerHTML = '<span class="ln-btn-icon">💾</span><span class="ln-btn-label">Update</span>'; $('lnCancelEdit').hidden = false;
        $('lnTitle').textContent = '🤝 Edit loan';
      }
    } finally { setBusy(false); }
  });

  function openPayment(loan) {
    paymentLoan = loan;
    $('lnPay').hidden = false;
    $('lnPayInfo').textContent = `${loan.person} · Pending ${formatMoney(loan.pending)}`;
    $('lnPayAmount').value = '';
    $('lnPayAmount').max = String(loan.pending);
    $('lnPayPreview').textContent = `Remaining after payment: ${formatMoney(loan.pending)}`;
    $('lnPayAmount').focus();
  }
  $('lnPayAmount').addEventListener('input', () => {
    if (!paymentLoan) return;
    const value = Number($('lnPayAmount').value);
    if (!validAmount(value)) $('lnPayPreview').textContent = `Remaining: ${formatMoney(paymentLoan.pending)}`;
    else if (value > paymentLoan.pending) $('lnPayPreview').textContent = 'Payment pending amount se zyada nahi ho sakta';
    else $('lnPayPreview').textContent = `Remaining after payment: ${formatMoney(Math.max(0, paymentLoan.pending - value))}`;
  });
  $('lnPaySave').addEventListener('click', async () => {
    if (busy || !paymentLoan) return;
    const amount = Number($('lnPayAmount').value);
    if (!validAmount(amount)) return toast('Valid payment amount enter karo', true);
    if (amount > paymentLoan.pending + 0.000001) return toast('Payment pending amount se zyada nahi ho sakta', true);
    const target = paymentLoan;
    const previous = { ...target };
    const nextReturned = Math.min(target.amount, target.returned + amount);
    const optimistic = { ...target, returned: nextReturned, pending: Math.max(0, target.pending - amount),
      status: nextReturned >= target.amount ? 'CLEARED' : 'PARTIAL' };
    ++loadSequence;
    loans = loans.map((r) => r.id === target.id ? optimistic : r);
    draw(); writeLoanCache(); closePayment(); setBusy(true);
    try {
      await request('returnLoan', { id: target.id, amount: String(amount) });
      toast('Payment recorded ✓'); load();
    } catch (err) {
      loans = loans.map((r) => r.id === target.id ? previous : r);
      draw(); writeLoanCache(); toast(`Payment failed: ${err.message}`, true);
    } finally { setBusy(false); }
  });

  $('lnB').addEventListener('click', (event) => {
    const d = event.target.closest('.ln-dots');
    const open = $('lnB').querySelector('.ln-actions.open');
    if (open && open !== (d && d.parentNode)) open.classList.remove('open');
    if (d) d.parentNode.classList.toggle('open');
    else if (!event.target.closest('.ln-menu')) return;
  });
  $('lnB').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-a]');
    if (!button || busy) return;
    const loan = loans.find((r) => r.id === button.dataset.i);
    if (!loan) return;
    const action = button.dataset.a;
    if (action === 'edit') {
      editId = loan.id;
      $('lnP').value = loan.person; $('lnD').value = loan.date;
      $('lnA').value = loan.amount; $('lnE').value = loan.expected; $('lnN').value = loan.note;
      $('lnS').innerHTML = '<span class="ln-btn-icon">💾</span><span class="ln-btn-label">Update</span>'; $('lnCancelEdit').hidden = false; $('lnTitle').textContent = '🤝 Edit loan';
      $('lnP').focus();
    } else if (action === 'delete') {
      if (!confirm(`Delete loan for ${loan.person}? This cannot be undone.`)) return;
      // Remove the row immediately; restore it only if the server rejects deletion.
      const previousLoans = loans.slice();
      ++loadSequence;
      loans = loans.filter((r) => r.id !== loan.id);
      draw();
      writeLoanCache();
      setBusy(true);
      try {
        await request('deleteLoan', { id: loan.id });
        toast('Loan deleted ✓');
        load(); // reconcile silently in the background
      } catch (err) {
        loans = previousLoans;
        draw();
        writeLoanCache();
        toast(`Delete failed: ${err.message}`, true);
      } finally { setBusy(false); }
    } else if (action === 'partial') {
      if (loan.pending > 0) openPayment(loan);
    } else if (action === 'paid') {
      if (loan.pending <= 0) return;
      if (!confirm(`Mark full pending amount ${formatMoney(loan.pending)} for ${loan.person} as paid?`)) return;
      const previous = { ...loan };
      const optimistic = { ...loan, returned: loan.amount, pending: 0, status: 'CLEARED' };
      ++loadSequence;
      loans = loans.map((r) => r.id === loan.id ? optimistic : r);
      draw(); writeLoanCache(); setBusy(true);
      try { await request('payLoan', { id: loan.id }); toast('Loan marked fully paid ✓'); load(); }
      catch (err) {
        loans = loans.map((r) => r.id === loan.id ? previous : r);
        draw(); writeLoanCache(); toast(`Could not mark paid: ${err.message}`, true);
      } finally { setBusy(false); }
    }
  });

  $('lnX').addEventListener('click', close);
  $('lnPayX').addEventListener('click', closePayment);
  $('lnPayCancel').addEventListener('click', closePayment);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('lnPay').hidden) closePayment(); else if (overlay.style.display === 'flex') close();
    }
  });

  const openButton = document.createElement('button');
  openButton.className = 'ln-launch';
  openButton.type = 'button';
  const loanScriptSrc = document.currentScript?.src || '';
  const loanIconSrc = loanScriptSrc ? new URL('loan-icon.png', loanScriptSrc).href : 'loan-icon.png';
  openButton.innerHTML = `<img src="${loanIconSrc}" alt="" aria-hidden="true">`;
  openButton.setAttribute('aria-label', 'Open Loans');
  openButton.title = 'Loans';
  openButton.addEventListener('click', () => {
    resetForm();
    // Paint the last known data synchronously, then refresh without blocking the modal.
    if (!hasLoadedOnce) {
      const cached = readLoanCache();
      if (cached) loans = cached;
    }
    draw();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    load({ silent: true });
  });

  // Place the Loans shortcut immediately beside the app's eye/visibility control.
  // Supports common IDs and accessible labels; sync button is only a fallback.
  const eyeButton = document.querySelector(
    '#eyeBtn, #eyeButton, #toggleEye, #toggleVisibility, #visibilityToggle, [data-action="toggle-visibility"], [aria-label*="eye" i], [title*="eye" i], [aria-label*="visibility" i], [title*="visibility" i], [aria-label*="hide amount" i], [title*="hide amount" i]'
  );
  if (eyeButton && eyeButton.parentNode) {
    eyeButton.insertAdjacentElement('afterend', openButton);
  } else {
    const syncButton = $('syncBtn');
    if (syncButton && syncButton.parentNode) syncButton.before(openButton);
    else document.body.append(openButton);
  }
  $('lnD').value = localToday();
  // Warm the in-memory list before the user opens the modal; cached data is available instantly.
  const cachedLoans = readLoanCache();
  if (cachedLoans) { loans = cachedLoans; draw(); }
  load({ silent: true });
})();

/* swipe-left on a loan row opens its action menu */
(function () {
  const b = document.getElementById('lnB');
  if (!b) return;
  let x0, y0, tr;
  const rowOf = (t) => { let r = t.closest('tr'); if (r && r.classList.contains('ln-noterow')) r = r.previousElementSibling; return r; };
  b.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; tr = e.target.closest('.ln-menu,.ln-dots') ? null : rowOf(e.target); }, { passive: true });
  b.addEventListener('touchend', (e) => {
    if (!tr) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const a = tr.querySelector('.ln-actions'); if (!a) return;
    b.querySelectorAll('.ln-actions.open').forEach((o) => { if (o !== a) o.classList.remove('open'); });
    a.classList.toggle('open', dx < 0);
  }, { passive: true });
})();
