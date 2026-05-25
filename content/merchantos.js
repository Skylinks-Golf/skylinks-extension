(function LightspeedSalesReportUI() {

  const { TD, TH, escHtml, makeLogger, createModal, apiClient, paginate, csv, download, runReport, dates, dom, config } = window.SkylinksUtils;
  const ACCOUNT_ID = window.location.pathname.match(/\/Account\/(\d+)/)?.[1] || config.lightspeed.fallbackAccountId;
  const SHOP_ID = config.lightspeed.shopId;
  const log = makeLogger('LS Report');

  const PAYMENT_METHOD_RULES = [
    { when: ({ dName }) => dName === 'Owner Comp',                                                                      method: 'Owner Comp' },
    { when: ({ dName }) => dName === 'Skylinks Membership Bucket [ARCHIVED]',                                           method: 'Memberships' },
    { when: ({ dName }) => dName === '_X_Owner Approved - Security' || dName === '_X_Owner Approved - DJ',              method: 'DJ Comps' },
    { when: ({ lineTotal, iName }) => lineTotal === 0 && iName.includes('VIP Voucher'),                                 method: 'VIP Voucher' },
    { when: ({ lineTotal, dName }) => lineTotal === 0 && (dName === 'Beer Bucket Discount 5x$20' || dName === 'Shooter w/Bucket Discount'), method: 'Marketing' },
    { when: ({ lineTotal, iName, cust }) => lineTotal === 0 && iName.includes(' GF') && cust,                          method: 'Membership Golf Package' },
    { when: ({ lineTotal, dName }) => lineTotal === 0 && dName,                                                        method: ctx => ctx.dName },
  ];

  function resolveMethod(ctx) {
    for (const rule of PAYMENT_METHOD_RULES) {
      if (rule.when(ctx)) return typeof rule.method === 'function' ? rule.method(ctx) : rule.method;
    }
    return ctx.paymentMethod;
  }

  const COLS = [
    { header: 'Transaction ID',  value: r => r.transactionID },
    { header: 'Date',            value: r => dates.formatShortDate(r.date) },
    { header: 'Item Name',       value: r => r.itemName },
    { header: 'Category',        value: r => r.parentCategory },
    { header: 'Payment Method',  value: r => r.paymentMethod },
    { header: 'Quantity',        value: r => r.quantity },
    { header: 'Unit Price',      value: r => '$' + r.unitPrice },
    { header: 'Subtotal',        value: r => '$' + r.subtotal },
    { header: 'Discount Amount', value: r => '$' + r.discountAmount },
    { header: 'Tax Amount',      value: r => r.taxAmount ? '$' + r.taxAmount : '' },
    { header: 'Line Total',      value: r => '$' + r.lineTotal },
    { header: 'Customer Name',   value: r => r.customerName },
    { header: 'Discount Name',   value: r => r.discountName },
  ];

  const api = apiClient({
    baseUrl: `https://us.merchantos.com/API/Account/${ACCOUNT_ID}`,
    auth: 'cookie',
    retry: { attempts: 2, delayMs: 1000, methods: ['GET'] },
  });

  const modal = createModal({
    id: 'ls-dr',
    title: 'Sales Lines Report',
    emoji: '📊',
    description: 'Fetches all sale line items for a date via the Lightspeed API and downloads a CSV with Transaction ID, Category, Item, SKU, Quantity, Prices, Discount, Tax Rate, Tax Amount, Customer Name, and Payment Method.',
    fields: [{ id: 'date', type: 'date', label: 'Report Date', value: dates.todayLocal() }],
    runLabel: 'Generate Report',
  });

  runReport({
    modal,
    validate: ({ date }) => date ? null : 'Please select a date.',

    fetch: async ({ date: dateVal }, ctx) => {
      ctx.setStatus('Fetching definitions…');
      log('Fetching shop config, discounts, and categories…');

      const [shopData, activeDiscounts, archivedDiscounts, categories] = await Promise.all([
        api.get(`/Shop.json?shopID=${SHOP_ID}`),
        paginate({
          fetchPage: cur => api.get(`/Discount.json?limit=100&archived=false&offset=${cur}`),
          getItems: r => dom.toArr(r.Discount),
          getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
          pageSize: 100, parallel: true,
        }),
        paginate({
          fetchPage: cur => api.get(`/Discount.json?limit=100&archived=true&offset=${cur}`),
          getItems: r => dom.toArr(r.Discount),
          getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
          pageSize: 100, parallel: true,
        }),
        paginate({
          fetchPage: cur => api.get(`/Category.json?limit=100&offset=${cur}`),
          getItems: r => dom.toArr(r.Category),
          getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
          pageSize: 100, parallel: true,
        }),
      ]);

      const discounts = [...activeDiscounts, ...archivedDiscounts];
      const shops = dom.toArr(shopData.Shop);
      const shop = shops.find(s => s.shopID === SHOP_ID) || shops[0];
      const isTaxInclusive = shop?.isTaxInclusive === 'true';
      log(`Shop: "${shop?.name}", isTaxInclusive=${isTaxInclusive}`);

      const discountMap = {};
      discounts.forEach(d => {
        discountMap[d.discountID] = d.archived === 'true' ? d.name + ' [ARCHIVED]' : d.name;
      });
      const categoryMap = {};
      categories.forEach(c => { categoryMap[c.categoryID] = { name: c.name, parentID: c.parentID }; });
      log(`Loaded ${activeDiscounts.length} active + ${archivedDiscounts.length} archived discount(s), ${categories.length} category/categories.`);
      ctx.setProgress(10);

      const { start: startUTC, end: endUTC } = dates.pacificDayUTCWindow(dateVal);
      log(`Pacific day UTC window: ${startUTC} → ${endUTC}`);
      const tf = encodeURIComponent('><,' + startUTC + ',' + endUTC);
      const rels = encodeURIComponent('["SaleLines","SaleLines.Item","Customer","SalePayments","SalePayments.PaymentType"]');

      ctx.setStatus('Fetching sales…');
      log('Fetching sales…');
      const allSales = await paginate({
        fetchPage: cur => api.get(`/Sale.json?completed=true&completeTime=${tf}&shopID=${SHOP_ID}&load_relations=${rels}&limit=100&offset=${cur}`),
        getItems: r => dom.toArr(r.Sale),
        getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
        pageSize: 100, parallel: true,
      });
      log(`All pages loaded. Total sales: ${allSales.length}.`);
      ctx.setProgress(70);

      return { isTaxInclusive, discountMap, categoryMap, allSales };
    },

    process: ({ isTaxInclusive, discountMap, categoryMap, allSales }, values) => {
      const dateVal = values.date;
      const rows = [];
      allSales.forEach(sale => {
        const cust = sale.Customer ? (sale.Customer.firstName + ' ' + sale.Customer.lastName).trim() : '';
        const payments = dom.toArr(sale.SalePayments?.SalePayment)
          .filter(p => p.archived !== 'true')
          .map(p => {
            const t = p.PaymentType?.type || '';
            const pName = p.PaymentType?.name || 'Unknown';
            if (t === 'credit card' || t === 'debit card') return 'Card Payment';
            if (pName === '_X_ 100% - Skylinks Membership') return 'Memberships';
            return pName;
          });
        const paymentMethod = payments.join(' / ');

        dom.toArr(sale.SaleLines?.SaleLine).forEach(line => {
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

          const lineTotal = parseFloat(line.calcTotal);
          rows.push({
            transactionID: sale.saleID,
            date: dateVal,
            itemName: iName || 'Item ' + line.itemID,
            parentCategory,
            paymentMethod: resolveMethod({ dName, lineTotal, iName, cust, paymentMethod }),
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
      return rows;
    },

    render: (rows, values, modal) => {
      const dateVal = values.date;
      const discountedRows = rows.filter(r => r.discountAmount !== '0.00');
      log(`Processed ${rows.length} line(s). ${discountedRows.length} line(s) have discounts.`);
      modal.setProgress(85);

      const csvText = csv.toCSV(rows, COLS);
      const fname = 'sales_lines_' + dateVal + '.csv';
      log(`CSV ready: "${fname}" (${rows.length} data rows).`);
      modal.setProgress(95);

      // Discount summary table — kept inline; has a TOTAL row that doesn't fit table.render
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

      modal.setProgress(100);
      modal.setStatus(`✅ ${rows.length} sale lines exported — ${discountedRows.length} discounted across ${Object.keys(summary).length} discount types.`, 'success');
      log(`Report complete. ${rows.length} lines exported, $${grand.toFixed(2)} total discounts.`);

      const dlBtn = download.csvButton({ csv: csvText, filename: fname, label: `⬇  Download ${fname}` });
      const result = document.createElement('div');
      result.appendChild(dlBtn);
      result.insertAdjacentHTML('beforeend',
        `<div style="font-size:12px;font-weight:700;color:#262b2f;margin-top:14px;margin-bottom:4px;">Discount Summary</div>${tbl}`
      );
      modal.showResult(result);
    },
  });

})();
