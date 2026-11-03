(function StripeReportSaveUI() {

  // ─────────────────────────────────────────────────────────────────────────────
  // Stripe — Save Daily Transactions Report
  //
  // The data comes from the private Stripe App "Daily transactions"
  // (apps/skylinks-stripe-app). That app fetches through the public Stripe API as
  // the signed-in user and copies a CSV to the clipboard. This tool only takes the
  // pasted CSV, checks it's our report, and saves it as a file for Excel.
  //
  // It makes NO network calls and never touches Stripe auth. The browser-session
  // approach was ruled out — see docs/api_refs/stripe.md.
  //
  // CSV CONTRACT: EXPECTED_HEADER must match REPORT_HEADER in
  // skylinks-stripe-app/src/lib/report.ts exactly. Change both together.
  // ─────────────────────────────────────────────────────────────────────────────

  const { makeLogger, createModal, csv, download, table, theme } = window.SkylinksUtils;
  const log = makeLogger('Stripe Report');

  const EXPECTED_HEADER = 'Payment Date,Time (PT),First Name,Last Name,Amount,Net,Payout Date,Payout Status,Note,Stripe ID'; // contract v2

  const body = document.createElement('div');
  body.innerHTML = `
    <ol style="margin:0 0 10px 18px;padding:0;font-size:0.875rem;color:${theme.color.muted};line-height:1.6;">
      <li>Open the <b>Daily transactions</b> app in the Stripe drawer and pick the date.</li>
      <li>Click <b>Copy report for export</b>.</li>
      <li>Click in the box below and press <b>Ctrl+V</b>.</li>
    </ol>
    <textarea id="stripe-save-paste" rows="4" spellcheck="false" placeholder="Paste the report here (Ctrl+V)…"
      style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ${theme.color.border};border-radius:${theme.radius.input};font:12px/1.4 Consolas,monospace;resize:vertical;"></textarea>`;

  const modal = createModal({
    id: 'stripe-save',
    title: 'Save Stripe Report',
    emoji: '💳',
    description: 'Saves the Daily transactions report from the Stripe app as a CSV file for Excel.',
    body,
    runLabel: null,
  });

  const box = document.getElementById('stripe-save-paste');

  function handle(text) {
    modal.resetResult();
    const clean = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (!clean) { modal.setStatus(''); return; }

    const [header, ...lines] = clean.split('\n');
    if (header.trim() !== EXPECTED_HEADER) {
      modal.setStatus('❌ That doesn’t look like the Daily transactions report. Copy it again from the Stripe app.', 'error');
      log('Header mismatch — got', JSON.stringify(header.slice(0, 120)));
      return;
    }
    if (!lines.length) {
      modal.setStatus('No successful payments in that report — nothing to save.', 'warn');
      return;
    }

    const rows = csv.parseCSV(clean); // keys are lower-cased header names
    const dates = [...new Set(rows.map(r => r['payment date']).filter(Boolean))];
    if (dates.length !== 1) {
      modal.setStatus('❌ Report spans more than one day — copy it again from the Stripe app.', 'error');
      return;
    }
    const date = dates[0];
    const sumCents = key => rows.reduce((s, r) => s + Math.round(parseFloat(r[key] || '0') * 100), 0);
    const usd = c => '$' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const total = `${usd(sumCents('amount'))} gross, ${usd(sumCents('net'))} net`;
    const fname = `stripe_transactions_${date}.csv`;

    modal.setStatus(`✅ ${rows.length} payment(s) on ${date}: ${total}.`, 'success');

    const result = document.createElement('div');
    // Re-emit the original text (CRLF) so the file is byte-for-byte what the app produced.
    result.appendChild(download.csvButton({ csv: clean.replace(/\n/g, '\r\n') + '\r\n', filename: fname, label: `⬇  Download ${fname}`, bom: true }));
    const PREVIEW = [
      { header: 'Time', value: r => r['time (pt)'] },
      { header: 'Name', value: r => `${r['first name']} ${r['last name']}`.trim() },
      { header: 'Amount', value: r => '$' + r.amount, align: 'right' },
      { header: 'Net', value: r => r.net ? '$' + r.net : '—', align: 'right' },
      { header: 'Payout', value: r => r['payout date'] ? `${r['payout date']} (${r['payout status']})` : r['payout status'] },
      { header: 'Note', value: r => r.note },
    ];
    const tbl = table.render(rows, PREVIEW);
    tbl.style.marginTop = '12px';
    result.appendChild(tbl);
    modal.showResult(result);
  }

  box.addEventListener('paste', e => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    box.value = text;
    handle(text);
  });
  box.addEventListener('input', () => handle(box.value));
  box.focus();

})();
