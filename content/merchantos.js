(function LightspeedSalesReportUI() {

    const ACCOUNT_ID = window.location.pathname.match(/\/Account\/(\d+)/)?.[1] || '305872';
    const SHOP_ID = '1';
    const BASE = 'https://us.merchantos.com/API/Account/' + ACCOUNT_ID;
    const { TD, TH, escHtml, escCsv, makeLogger } = window.SkylinksUtils;
    const log = makeLogger('LS Report');

    document.getElementById('ls-dr-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ls-dr-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    const today = new Date().toISOString().slice(0, 10);
    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">📊</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',Tahoma,sans-serif;color:#262b2f;">Sales Lines Report</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#4b5563;line-height:1.5;">
      Fetches all sale line items for a date via the Lightspeed API and downloads a CSV
      with Transaction ID, Category, Item, SKU, Quantity, Prices, Discount, Tax Rate, Tax Amount, Customer Name, and Payment Method.
    </p>
    <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Report Date</label>
    <input id="ls-dr-date" type="date" value="${today}"
      style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;box-sizing:border-box;margin-bottom:16px;outline:none;" />
    <button id="ls-dr-run"
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      Generate Report
    </button>
    <div id="ls-dr-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="ls-dr-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="ls-dr-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
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
    const toArr = v => !v ? [] : (Array.isArray(v) ? v : [v]);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    let activeBlobURL = null;
    const revokeBlobURL = () => { if (activeBlobURL) { URL.revokeObjectURL(activeBlobURL); activeBlobURL = null; } };

    $('ls-dr-close').onclick = () => { revokeBlobURL(); overlay.remove(); };
    overlay.onclick = e => { if (e.target === overlay) { revokeBlobURL(); overlay.remove(); } };

    async function apiFetch(url) {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error(`API ${r.status} ${r.statusText}`);
        return r.json();
    }

    async function apiFetchRetry(url) {
        try { return await apiFetch(url); } catch (e) {
            await sleep(1000);
            return await apiFetch(url);
        }
    }

    // Paginate through all records for a Lightspeed endpoint.
    // urlBase must already include ?limit=100 and all filters except &offset.
    async function fetchAllPaged(urlBase, resourceKey) {
        const first = await apiFetch(urlBase + '&offset=0');
        const total = parseInt(first['@attributes']?.count || '0', 10);
        let items = toArr(first[resourceKey]);
        if (total > 100) {
            const offsets = [];
            for (let o = items.length; o < total; o += 100) offsets.push(o);
            const pages = await Promise.all(offsets.map(o => apiFetchRetry(urlBase + '&offset=' + o)));
            pages.forEach(p => { items = items.concat(toArr(p[resourceKey])); });
        }
        return items;
    }

    // Derive midnight Pacific as a UTC Date for a given YYYY-MM-DD string.
    // Uses Intl so the result is correct regardless of the browser's own timezone.
    function pacificMidnightAsUTC(dateStr) {
        const noon = new Date(dateStr + 'T12:00:00Z');
        const pHour = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(noon),
            10
        );
        const offsetHours = 12 - pHour; // e.g. 4am Pacific = UTC-8 → offset=8; 5am = UTC-7 → offset=7
        const midnight = new Date(dateStr + 'T00:00:00Z');
        midnight.setUTCHours(offsetHours);
        return midnight;
    }

    function buildPacificDayUTCWindow(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const nextDateStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
        return {
            start: pacificMidnightAsUTC(dateStr).toISOString(),
            end: pacificMidnightAsUTC(nextDateStr).toISOString(),
        };
    }

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
            // 1. Fetch shop config, discount definitions, and categories in parallel
            setStatus('Fetching definitions…');
            log('Fetching shop config, discounts, and categories…');
            const [shopData, discounts, categories] = await Promise.all([
                apiFetch(`${BASE}/Shop.json?shopID=${SHOP_ID}`),
                fetchAllPaged(`${BASE}/Discount.json?limit=100`, 'Discount'),
                fetchAllPaged(`${BASE}/Category.json?limit=100`, 'Category'),
            ]);

            const shops = toArr(shopData.Shop);
            const shop = shops.find(s => s.shopID === SHOP_ID) || shops[0];
            const isTaxInclusive = shop?.isTaxInclusive === 'true';
            log(`Shop: "${shop?.name}", isTaxInclusive=${isTaxInclusive}`);

            const discountMap = {};
            discounts.forEach(d => { discountMap[d.discountID] = d.name; });

            const categoryMap = {};
            categories.forEach(c => { categoryMap[c.categoryID] = { name: c.name, parentID: c.parentID }; });

            log(`Loaded ${discounts.length} discount(s), ${categories.length} category/categories.`);
            setProgress(10);

            // 2. Build UTC time range for the Pacific calendar day
            const { start: startUTC, end: endUTC } = buildPacificDayUTCWindow(dateVal);
            log(`Pacific day UTC window: ${startUTC} → ${endUTC}`);

            const tf = encodeURIComponent('><,' + startUTC + ',' + endUTC);
            const rels = encodeURIComponent('["SaleLines","SaleLines.Item","Customer","SalePayments","SalePayments.PaymentType"]');
            const urlBase = `${BASE}/Sale.json?completed=true&completeTime=${tf}&shopID=${SHOP_ID}&load_relations=${rels}&limit=100`;

            // 3. First page → get total count
            setStatus('Fetching sales…');
            log('Fetching first page of sales…');
            const first = await apiFetch(urlBase + '&offset=0');
            const total = parseInt(first['@attributes'].count, 10);
            let allSales = toArr(first.Sale);
            log(`Found ${total} total sale(s). Page 1 loaded (${allSales.length} sales).`);
            setProgress(20);
            setStatus(`Loading ${total} sales…`);

            // 4. Remaining pages with per-page retry
            if (total > 100) {
                const offsets = [];
                for (let o = 100; o < total; o += 100) offsets.push(o);
                log(`Fetching ${offsets.length} remaining page(s) in parallel…`);
                const pages = await Promise.all(offsets.map(o => apiFetchRetry(urlBase + '&offset=' + o)));
                pages.forEach(p => { allSales = allSales.concat(toArr(p.Sale)); });
                log(`All pages loaded. Total sales in memory: ${allSales.length}.`);
            }
            setProgress(70);

            // 5. Extract sale lines
            setStatus('Processing line items…');
            log('Processing sale lines…');
            const rows = [];
            allSales.forEach(sale => {
                const cust = sale.Customer ? (sale.Customer.firstName + ' ' + sale.Customer.lastName).trim() : '';
                const payments = toArr(sale.SalePayments?.SalePayment)
                    .filter(p => p.archived !== 'true')
                    .map(p => {
                        const t = p.PaymentType?.type || '';
                        return (t === 'credit card' || t === 'debit card') ? 'Card Payment' : (p.PaymentType?.name || 'Unknown');
                    });
                const paymentMethod = payments.join(' / ');

                toArr(sale.SaleLines?.SaleLine).forEach(line => {
                    const dId = line.discountID;
                    const disc = parseFloat(line.calcLineDiscount) || 0;
                    const dName = dId && dId !== '0' ? (discountMap[dId] || 'Unknown (ID:' + dId + ')') : '';
                    const cat = categoryMap[line.Item?.categoryID];
                    const parentCategory = cat
                        ? (cat.parentID && cat.parentID !== '0' ? (categoryMap[cat.parentID]?.name || cat.name) : cat.name)
                        : '';
                    const iName = line.Item?.description || '';

                    const calcTaxAmount = (() => {
                        if (line.tax !== 'true') return '';
                        const r1 = parseFloat(line.tax1Rate) || 0;
                        const r2 = parseFloat(line.tax2Rate) || 0;
                        const rate = r1 + r2;
                        if (rate === 0) return '';
                        if (isTaxInclusive) {
                            const total = parseFloat(line.calcTotal);
                            return (total - total / (1 + rate)).toFixed(2);
                        } else {
                            return (parseFloat(line.calcSubtotal) * rate).toFixed(2);
                        }
                    })();

                    const taxRate = (() => {
                        if (line.tax !== 'true') return '';
                        const r1 = parseFloat(line.tax1Rate) || 0;
                        const r2 = parseFloat(line.tax2Rate) || 0;
                        const pct = v => (v * 100).toFixed(4).replace(/\.?0+$/, '') + '%';
                        return r2 > 0 ? pct(r1) + ' + ' + pct(r2) : pct(r1);
                    })();

                    // Zero-value lines on GF items carry a logical payment method
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
                        transactionID: sale.saleID,
                        date: dateVal,
                        itemName: iName || 'Item ' + line.itemID,
                        parentCategory,
                        paymentMethod: linePaymentMethod,
                        quantity: line.unitQuantity || '1',
                        unitPrice: parseFloat(line.unitPrice).toFixed(2),
                        subtotal: parseFloat(line.calcSubtotal).toFixed(2),
                        discountAmount: disc.toFixed(2),
                        taxAmount: calcTaxAmount,
                        lineTotal: parseFloat(line.calcTotal).toFixed(2),
                        customerName: cust,
                        discountName: dName,
                    });
                });
            });

            rows.sort((a, b) => parseInt(a.transactionID) - parseInt(b.transactionID));
            const discountedCount = rows.filter(r => r.discountAmount !== '0.00').length;
            log(`Processed ${rows.length} line(s) across ${allSales.length} sale(s). ${discountedCount} line(s) have discounts.`);
            setProgress(85);

            // 6. Build CSV
            log('Building CSV…');
            const fmtDate = d => { const [y, m, day] = d.split('-'); return `${+m}/${+day}/${y}`; };
            const csv = [
                'Transaction ID,Date,Item Name,Category,Payment Method,Quantity,Unit Price,Subtotal,Discount Amount,Tax Amount,Line Total,Customer Name,Discount Name',
                ...rows.map(r => [
                    r.transactionID, fmtDate(r.date), r.itemName, r.parentCategory, r.paymentMethod,
                    r.quantity, '$' + r.unitPrice, '$' + r.subtotal,
                    '$' + r.discountAmount,
                    r.taxAmount ? '$' + r.taxAmount : '',
                    '$' + r.lineTotal, r.customerName, r.discountName,
                ].map(escCsv).join(','))
            ].join('\n');

            activeBlobURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            const fname = 'sales_lines_' + dateVal + '.csv';
            log(`CSV ready: "${fname}" (${rows.length} data rows).`);
            setProgress(95);

            // 7. Discount summary table
            const discountedRows = rows.filter(r => r.discountAmount !== '0.00');
            const summary = {};
            discountedRows.forEach(r => {
                if (!summary[r.discountName]) summary[r.discountName] = { lines: 0, total: 0 };
                summary[r.discountName].lines++;
                summary[r.discountName].total += parseFloat(r.discountAmount);
            });
            const grand = discountedRows.reduce((s, r) => s + parseFloat(r.discountAmount), 0);

            let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${TH}text-align:left;">Discount Name</th>
          <th style="${TH}text-align:center;">Lines</th>
          <th style="${TH}text-align:right;">Total Discounted</th>
        </tr></thead><tbody>`;
            Object.entries(summary).sort((a, b) => b[1].total - a[1].total).forEach(([name, d]) => {
                tbl += `<tr><td style="${TD}">${name ? escHtml(name) : '<em style="color:#94a3b8">No name</em>'}</td><td style="${TD}text-align:center;">${d.lines}</td><td style="${TD}text-align:right;">$${d.total.toFixed(2)}</td></tr>`;
            });
            tbl += `<tr style="font-weight:700;"><td style="${TD}">TOTAL</td><td style="${TD}text-align:center;">${discountedRows.length}</td><td style="${TD}text-align:right;">$${grand.toFixed(2)}</td></tr></tbody></table>`;

            setProgress(100);
            setStatus(`✅ ${rows.length} sale lines exported — ${discountedRows.length} discounted across ${Object.keys(summary).length} discount types.`, '#16a34a');
            log(`Report complete. ${rows.length} lines exported, $${grand.toFixed(2)} total discounts.`);

            $('ls-dr-result').innerHTML = `
        <a href="${activeBlobURL}" download="${fname}"
          style="display:block;text-align:center;background:#eeb02b;color:#1c1b19;padding:13px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:14px;">
          ⬇&nbsp; Download ${fname}
        </a>
        <div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Discount Summary</div>
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
