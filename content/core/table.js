(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  function render(rows, cols, opts = {}) {
    const cellStyle = opts.cellStyle || 'padding:6px 10px;border-bottom:1px solid #e2e8f0;';
    const headerStyle = opts.headerStyle || 'padding:6px 10px;font-weight:600;text-align:left;border-bottom:2px solid #d1d5db;';

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%;font-size:0.875rem;';

    // thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    cols.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.header;
      th.style.cssText = headerStyle + (col.align ? `text-align:${col.align};` : '');
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      cols.forEach(col => {
        const td = document.createElement('td');
        td.textContent = col.value(row);
        const extra = (col.style ? col.style(row) : '') + (col.align ? `text-align:${col.align};` : '');
        td.style.cssText = cellStyle + extra;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // tfoot (optional totals row)
    if (opts.totals) {
      const tfoot = document.createElement('tfoot');
      const tr = document.createElement('tr');
      cols.forEach(col => {
        const td = document.createElement('td');
        td.textContent = opts.totals[col.header] || '';
        td.style.cssText = headerStyle + (col.align ? `text-align:${col.align};` : '');
        tr.appendChild(td);
      });
      tfoot.appendChild(tr);
      table.appendChild(tfoot);
    }

    return table;
  }

  ns.table = { render };
})();
