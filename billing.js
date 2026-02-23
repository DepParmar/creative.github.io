/* ============================================================
   CREATIVE INFRA — Billing App Logic
   billing.js
   Default PIN: 1234  (SHA-256 hash stored below)
   To change PIN: update STORED_HASH with SHA-256 of new PIN,
   OR change it from the app by pressing Lock → re-entering.
   For security note: PIN protection here is client-side only,
   suitable for preventing casual unauthorised access.
   ============================================================ */

'use strict';

/* ── PIN Configuration ─────────────────────────────────────── */
// SHA-256 of "1234"
const DEFAULT_PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';
const STORAGE_KEY_PIN  = 'ci_billing_pin_hash';
const MAX_ATTEMPTS     = 5;
const LOCKOUT_MS       = 30000; // 30 seconds

/* ── State ─────────────────────────────────────────────────── */
let pinBuffer  = '';
let attempts   = 0;
let lockedUntil = 0;
let rowCounter = 0;

/* ── Helpers ───────────────────────────────────────────────── */
async function sha256(str) {
    const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function el(id) { return document.getElementById(id); }

function fmtNum(n) {
    return Number(n).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* ── PIN: get active hash ───────────────────────────────────── */
function activePinHash() {
    return localStorage.getItem(STORAGE_KEY_PIN) || DEFAULT_PIN_HASH;
}

/* ── PIN: dots ──────────────────────────────────────────────── */
function refreshDots() {
    for (let i = 1; i <= 4; i++) {
        el('d' + i).classList.toggle('on', i <= pinBuffer.length);
    }
}

/* ── PIN: keypad listeners ──────────────────────────────────── */
document.querySelectorAll('.key[data-k]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (Date.now() < lockedUntil) return;
        if (pinBuffer.length < 4) {
            pinBuffer += btn.dataset.k;
            refreshDots();
            if (pinBuffer.length === 4) checkPin();
        }
    });
});

el('key-del').addEventListener('click', () => {
    if (Date.now() < lockedUntil) return;
    pinBuffer = pinBuffer.slice(0, -1);
    refreshDots();
    el('pin-msg').textContent = '';
});

el('key-ok').addEventListener('click', () => {
    if (pinBuffer.length > 0) checkPin();
});

/* ── PIN: keyboard support ──────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (el('pin-gate').style.display === 'none') return;
    if (Date.now() < lockedUntil) return;
    if (e.key >= '0' && e.key <= '9' && pinBuffer.length < 4) {
        pinBuffer += e.key;
        refreshDots();
        if (pinBuffer.length === 4) checkPin();
    } else if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        refreshDots();
    } else if (e.key === 'Enter' && pinBuffer.length > 0) {
        checkPin();
    }
});

/* ── PIN: verify ────────────────────────────────────────────── */
async function checkPin() {
    if (Date.now() < lockedUntil) return;

    const hash = await sha256(pinBuffer);
    if (hash === activePinHash()) {
        attempts = 0;
        el('pin-gate').style.display = 'none';
        el('app').style.display      = 'block';
        initApp();
    } else {
        attempts++;
        pinBuffer = '';
        refreshDots();

        if (attempts >= MAX_ATTEMPTS) {
            lockedUntil = Date.now() + LOCKOUT_MS;
            el('pin-msg').textContent = '';
            showLockout();
        } else {
            el('pin-msg').textContent = `❌ Wrong PIN. ${MAX_ATTEMPTS - attempts} attempt(s) left.`;
            shakeCard();
        }
    }
}

function shakeCard() {
    const card = document.querySelector('.pin-card');
    card.classList.remove('shake');
    void card.offsetWidth; // reflow
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 420);
}

function showLockout() {
    const lockEl = el('pin-lockout');
    lockEl.style.display = 'block';
    const tick = setInterval(() => {
        const rem = Math.ceil((lockedUntil - Date.now()) / 1000);
        if (rem <= 0) {
            clearInterval(tick);
            lockEl.style.display = 'none';
            attempts = 0;
        } else {
            lockEl.textContent = `🔒 Too many attempts. Try again in ${rem}s`;
        }
    }, 500);
}

/* ── Lock app ───────────────────────────────────────────────── */
function lockApp() {
    pinBuffer = '';
    refreshDots();
    el('pin-msg').textContent = '';
    el('app').style.display      = 'none';
    el('pin-gate').style.display = 'flex';
}
window.lockApp = lockApp;

/* ── Init app ───────────────────────────────────────────────── */
function initApp() {
    const today = new Date().toISOString().slice(0, 10);
    el('inv-date').value = today;

    const due = new Date();
    due.setDate(due.getDate() + 30);
    el('inv-due').value = due.toISOString().slice(0, 10);

    // Auto invoice number
    const lastN = parseInt(localStorage.getItem('ci_last_inv') || '0') + 1;
    localStorage.setItem('ci_last_inv', lastN);
    const yr = new Date().getFullYear();
    el('inv-num').textContent = `INV-${yr}-${String(lastN).padStart(3, '0')}`;

    // Items table
    if (document.getElementById('items-body').children.length === 0) {
        addItem();
    }
}

/* ── Items: add row ─────────────────────────────────────────── */
function addItem() {
    rowCounter++;
    const id = rowCounter;
    const tr = document.createElement('tr');
    tr.id = `row-${id}`;
    tr.innerHTML = `
        <td class="sr-cell">${document.querySelectorAll('#items-body tr').length + 1}</td>
        <td><input type="text"   class="desc-in"  placeholder="Description of goods / services"></td>
        <td><input type="text"   class="hsn-in"   placeholder="HSN/SAC"></td>
        <td><input type="number" class="qty-in"   placeholder="0" min="0" step="any"></td>
        <td><input type="text"   class="unit-in"  placeholder="Nos"></td>
        <td><input type="number" class="rate-in"  placeholder="0.00" min="0" step="any"></td>
        <td class="tax-cell">0.00</td>
        <td>
            <select class="gst-sel">
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18" selected>18%</option>
                <option value="28">28%</option>
            </select>
        </td>
        <td class="gamt-cell">0.00</td>
        <td class="tot-cell">0.00</td>
        <td class="no-print">
            <button class="del-btn" data-id="${id}">✕</button>
        </td>`;
    document.getElementById('items-body').appendChild(tr);
    // attach listeners
    tr.querySelectorAll('input, select').forEach(inp => {
        inp.addEventListener('input',  calcTotals);
        inp.addEventListener('change', calcTotals);
    });
    calcTotals();
}
window.addItem = addItem;

/* ── Items: delete row (event delegation) ───────────────────── */
document.getElementById('items-body').addEventListener('click', e => {
    if (e.target.classList.contains('del-btn')) {
        e.target.closest('tr').remove();
        reNumberRows();
        calcTotals();
    }
});

function reNumberRows() {
    document.querySelectorAll('#items-body tr').forEach((tr, i) => {
        tr.querySelector('.sr-cell').textContent = i + 1;
    });
}

/* ── Calculations ───────────────────────────────────────────── */
function calcTotals() {
    let subtotal = 0;
    let totalGst = 0;

    document.querySelectorAll('#items-body tr').forEach(tr => {
        const qty  = parseFloat(tr.querySelector('.qty-in')?.value)  || 0;
        const rate = parseFloat(tr.querySelector('.rate-in')?.value) || 0;
        const gstP = parseFloat(tr.querySelector('.gst-sel')?.value) || 0;

        const taxable = qty * rate;
        const gstAmt  = taxable * gstP / 100;
        const total   = taxable + gstAmt;

        tr.querySelector('.tax-cell').textContent  = fmtNum(taxable);
        tr.querySelector('.gamt-cell').textContent = fmtNum(gstAmt);
        tr.querySelector('.tot-cell').textContent  = fmtNum(total);

        subtotal += taxable;
        totalGst += gstAmt;
    });

    const raw      = subtotal + totalGst;
    const rounded  = Math.round(raw);
    const roundOff = rounded - raw;

    // CGST + SGST for intra-state; IGST for inter-state
    // Toggle based on GST tax type selector (CGST/SGST by default)
    const cgst = totalGst / 2;
    const sgst = totalGst / 2;

    el('t-sub').textContent   = fmtNum(subtotal);
    el('t-cgst').textContent  = fmtNum(cgst);
    el('t-sgst').textContent  = fmtNum(sgst);
    el('t-igst').textContent  = fmtNum(totalGst);
    el('t-round').textContent = fmtNum(roundOff);
    el('t-grand').textContent = fmtNum(rounded);
    el('words').textContent   = rupeeWords(rounded);
}

/* ── Amount in Words (Indian system) ────────────────────────── */
function rupeeWords(amount) {
    const n = Math.round(amount);
    if (n === 0) return 'Zero Rupees Only';
    if (n < 0)   return 'Minus ' + rupeeWords(-n);

    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
                  'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function w(n) {
        if (n === 0)    return '';
        if (n < 20)     return ones[n] + ' ';
        if (n < 100)    return tens[Math.floor(n / 10)] + ' ' + w(n % 10);
        if (n < 1000)   return ones[Math.floor(n / 100)] + ' Hundred ' + w(n % 100);
        if (n < 100000) return w(Math.floor(n / 1000)) + 'Thousand ' + w(n % 1000);
        if (n < 10000000) return w(Math.floor(n / 100000)) + 'Lakh ' + w(n % 100000);
        return w(Math.floor(n / 10000000)) + 'Crore ' + w(n % 10000000);
    }

    return w(n).trim().replace(/\s+/g, ' ') + ' Rupees Only';
}

/* ── New Invoice ────────────────────────────────────────────── */
function newInvoice() {
    if (!confirm('Start a new invoice? Unsaved data will be lost.')) return;

    // Reset customer fields
    el('cust-name').textContent = 'Customer / Company Name';
    el('cust-addr').innerHTML   = 'Address Line 1<br>City, State – PIN Code';
    el('cust-gstin').textContent = 'Unregistered';
    el('cust-phone').textContent = 'Mobile Number';
    el('cust-state').textContent = 'Gujarat';
    el('cust-code').textContent  = '24';
    el('ship-addr').textContent  = 'Same as billing address';
    el('inv-place').textContent  = 'Gujarat (24)';

    // Reset items
    el('items-body').innerHTML = '';
    rowCounter = 0;

    // New invoice number
    const lastN = parseInt(localStorage.getItem('ci_last_inv') || '0') + 1;
    localStorage.setItem('ci_last_inv', lastN);
    const yr = new Date().getFullYear();
    el('inv-num').textContent = `INV-${yr}-${String(lastN).padStart(3, '0')}`;

    // Dates
    const today = new Date().toISOString().slice(0, 10);
    el('inv-date').value = today;
    const due = new Date();
    due.setDate(due.getDate() + 30);
    el('inv-due').value = due.toISOString().slice(0, 10);

    addItem();
    calcTotals();
}
window.newInvoice = newInvoice;

/* ── Save Draft ─────────────────────────────────────────────── */
function saveDraft() {
    const items = [];
    document.querySelectorAll('#items-body tr').forEach(tr => {
        items.push({
            desc : tr.querySelector('.desc-in')?.value || '',
            hsn  : tr.querySelector('.hsn-in')?.value  || '',
            qty  : tr.querySelector('.qty-in')?.value  || '',
            unit : tr.querySelector('.unit-in')?.value || '',
            rate : tr.querySelector('.rate-in')?.value || '',
            gst  : tr.querySelector('.gst-sel')?.value || '18',
        });
    });

    const draft = {
        invNum    : el('inv-num').textContent,
        invDate   : el('inv-date').value,
        invDue    : el('inv-due').value,
        invPlace  : el('inv-place').textContent,
        custName  : el('cust-name').textContent,
        custAddr  : el('cust-addr').innerHTML,
        custGstin : el('cust-gstin').textContent,
        custPhone : el('cust-phone').textContent,
        custState : el('cust-state').textContent,
        custCode  : el('cust-code').textContent,
        shipAddr  : el('ship-addr').innerHTML,
        payTerms  : el('pay-terms').textContent,
        bkName    : el('bk-name').textContent,
        bkAcc     : el('bk-acc').textContent,
        bkIfsc    : el('bk-ifsc').textContent,
        bkBranch  : el('bk-branch').textContent,
        terms     : el('terms').innerHTML,
        items,
    };

    localStorage.setItem('ci_billing_draft', JSON.stringify(draft));
    alert('✅ Draft saved successfully!');
}
window.saveDraft = saveDraft;

/* ── Load Draft ─────────────────────────────────────────────── */
function loadDraft() {
    const raw = localStorage.getItem('ci_billing_draft');
    if (!raw) { alert('No saved draft found.'); return; }

    const d = JSON.parse(raw);

    el('inv-num').textContent   = d.invNum   || '';
    el('inv-date').value        = d.invDate  || '';
    el('inv-due').value         = d.invDue   || '';
    el('inv-place').textContent = d.invPlace || '';
    el('cust-name').textContent = d.custName || '';
    el('cust-addr').innerHTML   = d.custAddr || '';
    el('cust-gstin').textContent = d.custGstin || '';
    el('cust-phone').textContent = d.custPhone || '';
    el('cust-state').textContent = d.custState || '';
    el('cust-code').textContent  = d.custCode  || '';
    el('ship-addr').innerHTML    = d.shipAddr  || '';
    el('pay-terms').textContent  = d.payTerms  || '';
    el('bk-name').textContent    = d.bkName    || '';
    el('bk-acc').textContent     = d.bkAcc     || '';
    el('bk-ifsc').textContent    = d.bkIfsc    || '';
    el('bk-branch').textContent  = d.bkBranch  || '';
    el('terms').innerHTML        = d.terms     || '';

    el('items-body').innerHTML = '';
    rowCounter = 0;

    (d.items || []).forEach(item => {
        addItem();
        const last = el('items-body').lastElementChild;
        last.querySelector('.desc-in').value  = item.desc;
        last.querySelector('.hsn-in').value   = item.hsn;
        last.querySelector('.qty-in').value   = item.qty;
        last.querySelector('.unit-in').value  = item.unit;
        last.querySelector('.rate-in').value  = item.rate;
        last.querySelector('.gst-sel').value  = item.gst;
    });

    calcTotals();
    alert('✅ Draft loaded!');
}
window.loadDraft = loadDraft;
