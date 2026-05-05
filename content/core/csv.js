(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const { escCsv } = ns;

  function toCSV(rows, cols) {
    const header = cols.map(c => escCsv(c.header)).join(',');
    const lines = rows.map(r => cols.map(c => escCsv(c.value(r))).join(','));
    return [header, ...lines].join('\n');
  }

  function toSection(title, rows, cols) {
    return title + '\n' + toCSV(rows, cols) + '\n';
  }

  function joinSections(sections) {
    return sections.join('\n');
  }

  function toAutoSection(title, models) {
    if (!Array.isArray(models) || models.length === 0) {
      return title + '\n(no data)\n';
    }
    const cols = Object.keys(models[0]).map(key => ({ header: key, value: r => r[key] }));
    return toSection(title, models, cols);
  }

  // Parses a CSV string. Handles quoted fields with commas and "" escaped quotes.
  function parseCSV(text) {
    text = text.replace(/\r\n|\r/g, '\n');
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = [];
    let lineNumber = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      lineNumber++;

      const cells = [];
      let pos = 0;
      while (pos <= line.length) {
        if (line[pos] === '"') {
          // Quoted field
          let val = '';
          pos++; // skip opening quote
          while (pos < line.length) {
            if (line[pos] === '"' && line[pos + 1] === '"') {
              val += '"';
              pos += 2;
            } else if (line[pos] === '"') {
              pos++; // skip closing quote
              break;
            } else {
              val += line[pos++];
            }
          }
          cells.push(val);
          if (line[pos] === ',') pos++; // skip comma
        } else {
          // Unquoted field
          const end = line.indexOf(',', pos);
          if (end === -1) {
            cells.push(line.slice(pos));
            break;
          } else {
            cells.push(line.slice(pos, end));
            pos = end + 1;
          }
        }
      }

      const row = { _lineNumber: lineNumber };
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
      rows.push(row);
    }
    return rows;
  }

  ns.csv = { toCSV, toSection, joinSections, toAutoSection, parseCSV };
})();
