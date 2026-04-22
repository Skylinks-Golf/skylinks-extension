(function LightspeedSalesReportUI() {

    const ACCOUNT_ID = window.location.pathname.match(/\/Account\/(\d+)/)?.[1] || '305872';
    const SHOP_ID = '1';
    const BASE = 'https://us.merchantos.com/API/Account/' + ACCOUNT_ID;

    document.getElementById('ls-dr-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ls-dr-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    const today = new Date().toISOString().slice(0, 10);
    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">📊</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">Sales Lines Report</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#64748b;line-height:1.5;">
      Fetches all sale line items for a date via the Lightspeed API and downloads a CSV
      with Transaction ID, Category, Item, SKU, Quantity, Prices, Discount, Tax Rate, Tax Amount, Customer Name, and Payment Method.
    </p>
    <label style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">Report Date</label>
    <input id="ls-dr-date" type="date" value="${today}"
      style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;box-sizing:border-box;margin-bottom:16px;outline:none;" />
    <button id="ls-dr-run"
      style="width:100%;background:#2563eb;color:#fff;border:none;padding:13px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">
      Generate Report
    </button>
    <div id="ls-dr-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="ls-dr-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="ls-dr-bar" style="background:#2563eb;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
      </div>
    </div>
    <div id="ls-dr-result" style="margin-top:12px;"></div>
    <button id="ls-dr-close"
      style="margin-top:14px;width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;padding:9px;border-radius:8px;font-size:13px;color:#64748b;cursor:pointer;">
      Close
    </button>
  `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const $ = id => document.getElementById(id);
    const css = (id, prop, val) => $(id).style[prop] = val;
    const setStatus = (msg, color) => { css('ls-dr-status', 'color', color || '#475569'); $('ls-dr-status').textContent = msg; };
    const setProgress = pct => css('ls-dr-bar', 'width', pct + '%');
    const apiFetch = url => fetch(url, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`); return r.json(); });
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let activeBlobURL = null;
    const revokeBlobURL = () => { if (activeBlobURL) { URL.revokeObjectURL(activeBlobURL); activeBlobURL = null; } };

    $('ls-dr-close').onclick = () => { revokeBlobURL(); overlay.remove(); };
    overlay.onclick = e => { if (e.target === overlay) { revokeBlobURL(); overlay.remove(); } };

    const log = (msg, ...args) => console.log(`[LS Report] ${msg}`, ...args);

    $('ls-dr-run').onclick = async function () {
        const dateVal = $('ls-dr-date').value;
        if (!dateVal) { setStatus('Please select a date.', '#dc2626'); return; }

        this.disabled = true;
        revokeBlobURL();
        $('ls-dr-result').innerHTML = '';
        css('ls-dr-progress', 'display', 'block');
        setProgress(0);
        log('Starting report for', dateVal);

        try {
            // 1. Fetch discount definitions and categories in parallel
            setStatus('Fetching definitions…');
            log('Fetching discount definitions and categories…');
            const [discData, catData] = await Promise.all([
                apiFetch(BASE + '/Discount.json?limit=200&offset=0'),
                apiFetch(BASE + '/Category.json?limit=200&offset=0'),
            ]);
            const discounts = Array.isArray(discData.Discount) ? discData.Discount : (discData.Discount ? [discData.Discount] : []);
            const discountMap = {};
            discounts.forEach(d => { discountMap[d.discountID] = d.name; });
            const categories = Array.isArray(catData.Category) ? catData.Category : (catData.Category ? [catData.Category] : []);
            const categoryMap = {};
            categories.forEach(c => { categoryMap[c.categoryID] = { name: c.name, parentID: c.parentID }; });
            log(`Loaded ${discounts.length} discount(s), ${categories.length} category/categories.`);
            setProgress(10);

            // 2. Build UTC time range that covers the full local calendar day
            const localMidnight = new Date(dateVal + 'T00:00:00');
            const TZ_OFFSET = localMidnight.getTimezoneOffset() / 60; // auto-handles PST/PDT
            const startUTC = dateVal + 'T' + String(TZ_OFFSET).padStart(2, '0') + ':00:00+00:00';
            const nd = new Date(dateVal + 'T00:00:00Z');
            nd.setUTCDate(nd.getUTCDate() + 1);
            const endUTC = nd.toISOString().slice(0, 10) + 'T' + String(TZ_OFFSET).padStart(2, '0') + ':00:00+00:00';
            log(`UTC window: ${startUTC} → ${endUTC} (TZ offset: UTC-${TZ_OFFSET})`);
            const tf = encodeURIComponent('><,' + startUTC + ',' + endUTC);
            const rels = encodeURIComponent('["SaleLines","SaleLines.Item","Customer","SalePayments","SalePayments.PaymentType"]');
            const url = o => `${BASE}/Sale.json?completed=true&completeTime=${tf}&shopID=${SHOP_ID}&load_relations=${rels}&limit=100&offset=${o}`;

            // 3. First page → get total count
            setStatus('Fetching sales…');
            log('Fetching first page of sales…');
            const first = await apiFetch(url(0));
            const total = parseInt(first['@attributes'].count);
            let allSales = Array.isArray(first.Sale) ? first.Sale : (first.Sale ? [first.Sale] : []);
            log(`Found ${total} total sale(s). Page 1 loaded (${allSales.length} sales).`);
            setProgress(20);
            setStatus(`Loading ${total} sales…`);

            // 4. Remaining pages in parallel
            if (total > 100) {
                const offsets = [];
                for (let o = 100; o < total; o += 100) offsets.push(o);
                log(`Fetching ${offsets.length} remaining page(s) in parallel…`);
                const pages = await Promise.all(offsets.map(o => apiFetch(url(o))));
                pages.forEach(p => { allSales = allSales.concat(Array.isArray(p.Sale) ? p.Sale : (p.Sale ? [p.Sale] : [])); });
                log(`All pages loaded. Total sales in memory: ${allSales.length}.`);
            }
            setProgress(70);

            // 5. Extract sale lines
            setStatus('Processing line items…');
            log('Processing sale lines…');
            const rows = [];
            allSales.forEach(sale => {
                const cust = sale.Customer ? (sale.Customer.firstName + ' ' + sale.Customer.lastName).trim() : '';
                const rawPayments = sale.SalePayments?.SalePayment;
                const payments = !rawPayments ? [] : (Array.isArray(rawPayments) ? rawPayments : [rawPayments]);
                const paymentMethod = payments.filter(p => p.archived !== 'true').map(p => {
                    const t = p.PaymentType?.type || '';
                    return (t === 'credit card' || t === 'debit card') ? 'Card Payment' : (p.PaymentType?.name || 'Unknown');
                }).join(' / ');
                let lines = sale.SaleLines?.SaleLine;
                if (!lines) return;
                if (!Array.isArray(lines)) lines = [lines];
                lines.forEach(line => {
                    const dId = line.discountID;
                    const disc = parseFloat(line.calcLineDiscount) || 0;
                    const dName = dId && dId !== '0' ? (discountMap[dId] || 'Unknown (ID:' + dId + ')') : '';
                    const cat = categoryMap[line.Item?.categoryID];
                    const parentCategory = cat
                        ? (cat.parentID && cat.parentID !== '0' ? (categoryMap[cat.parentID]?.name || cat.name) : cat.name)
                        : '';
                    const iName = line.Item?.description || '';
                    const linePaymentMethod = (() => {
                        if (parseFloat(line.calcTotal) === 0) {
                            if (iName.includes(' GF')) {
                                if (iName.includes('VIP Voucher')) return 'VIP Voucher';
                                if (cust) return 'Membership Golf Package';
                            }
                            if (dName) return dName;
                        }
                        return paymentMethod;
                    })();
                    rows.push({
                        transactionID: sale.saleID, date: dateVal,
                        itemName: iName || 'Item ' + line.itemID,
                        sku: line.Item?.customSku || '',
                        parentCategory,
                        quantity: line.unitQuantity || '1',
                        unitPrice: parseFloat(line.unitPrice).toFixed(2),
                        subtotal: parseFloat(line.calcSubtotal).toFixed(2),
                        discountAmount: disc.toFixed(2), discountName: dName,
                        taxRate: (line.tax === 'true') ? (() => {
                            const r1 = parseFloat(line.tax1Rate) || 0;
                            const r2 = parseFloat(line.tax2Rate) || 0;
                            const pct = v => (v * 100).toFixed(4).replace(/\.?0+$/, '') + '%';
                            return r2 > 0 ? pct(r1) + ' + ' + pct(r2) : pct(r1);
                        })() : '',
                        taxAmount: (line.tax === 'true') ? (() => {
                            const rate = (parseFloat(line.tax1Rate) || 0) + (parseFloat(line.tax2Rate) || 0);
                            const total = parseFloat(line.calcTotal);
                            return (total - (total / (1 + rate))).toFixed(2);
                        })() : '',
                        lineTotal: parseFloat(line.calcTotal).toFixed(2),
                        customerName: cust,
                        paymentMethod: linePaymentMethod,
                    });
                });
            });
            rows.sort((a, b) => parseInt(a.transactionID) - parseInt(b.transactionID));
            const discountedCount = rows.filter(r => r.discountAmount !== '0.00').length;
            log(`Processed ${rows.length} line(s) across ${allSales.length} sale(s). ${discountedCount} line(s) have discounts.`);
            setProgress(85);

            // 6. Build CSV
            log('Building CSV…');
            const esc = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };
            const csv = [
                'Transaction ID,Date,Category,Item Name,SKU,Quantity,Unit Price,Subtotal,Discount Amount,Discount Name,Tax Rate,Tax Amount,Line Total,Customer Name,Payment Method',
                ...rows.map(r => [r.transactionID, r.date, r.parentCategory, r.itemName, r.sku, r.quantity, '$' + r.unitPrice, '$' + r.subtotal, '$' + r.discountAmount, r.discountName, r.taxRate, r.taxAmount ? '$' + r.taxAmount : '', '$' + r.lineTotal, r.customerName, r.paymentMethod].map(esc).join(','))
            ].join('\n');

            // 7. Blob URL for download
            activeBlobURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            const fname = 'sales_lines_' + dateVal + '.csv';
            log(`CSV ready: "${fname}" (${rows.length} data rows).`);
            setProgress(95);

            // 8. Summary table
            const discountedRows = rows.filter(r => r.discountAmount !== '0.00');
            const summary = {};
            discountedRows.forEach(r => { if (!summary[r.discountName]) summary[r.discountName] = { lines: 0, total: 0 }; summary[r.discountName].lines++; summary[r.discountName].total += parseFloat(r.discountAmount); });
            const grand = discountedRows.reduce((s, r) => s + parseFloat(r.discountAmount), 0);
            const td = 'padding:6px 10px;border:1px solid #e2e8f0;font-size:12px;';
            const th = td + 'background:#f1f5f9;font-weight:600;color:#374151;';
            let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${th}text-align:left;">Discount Name</th>
          <th style="${th}text-align:center;">Lines</th>
          <th style="${th}text-align:right;">Total Discounted</th>
        </tr></thead><tbody>`;
            Object.entries(summary).sort((a, b) => b[1].total - a[1].total).forEach(([name, d]) => {
                tbl += `<tr><td style="${td}">${name ? escHtml(name) : '<em style="color:#94a3b8">No name</em>'}</td><td style="${td}text-align:center;">${d.lines}</td><td style="${td}text-align:right;">$${d.total.toFixed(2)}</td></tr>`;
            });
            tbl += `<tr style="font-weight:700;background:#f8fafc;"><td style="${td}">TOTAL</td><td style="${td}text-align:center;">${discountedRows.length}</td><td style="${td}text-align:right;">$${grand.toFixed(2)}</td></tr></tbody></table>`;

            setProgress(100);
            setStatus('✅ ' + rows.length + ' sale lines exported — ' + discountedRows.length + ' discounted across ' + Object.keys(summary).length + ' discount types.', '#16a34a');
            log(`Report complete. ${rows.length} lines exported, $${grand.toFixed(2)} total discounts.`);
            $('ls-dr-result').innerHTML = `
        <a href="${activeBlobURL}" download="${fname}"
          style="display:block;text-align:center;background:#16a34a;color:#fff;padding:13px 16px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:14px;">
          ⬇&nbsp; Download ${fname}
        </a>
        <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Discount Summary</div>
        ${tbl}`;
            $('ls-dr-result').querySelector('a').onclick = () => setTimeout(revokeBlobURL, 10000);

        } catch (err) {
            setStatus('❌ Error: ' + err.message, '#dc2626');
            css('ls-dr-progress', 'display', 'none');
            console.error('[LS Report] Error:', err);
        }
        this.disabled = false;
    };

})();
