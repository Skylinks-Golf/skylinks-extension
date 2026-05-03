(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // Accepts a Date instance or 'YYYY-MM-DD' string. Parse strings at local noon
  // to avoid off-by-one drift on DST boundaries.
  function weekRangeMonSun(reference) {
    let base;
    if (!reference) {
      base = new Date();
    } else if (reference instanceof Date) {
      base = reference;
    } else {
      base = new Date(reference + 'T12:00:00');
    }
    const daysToMon = (base.getDay() + 6) % 7;
    const mon = new Date(base);
    mon.setDate(base.getDate() - daysToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);
    return { monday: fmt(mon), sunday: fmt(sun) };
  }

  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Uses Intl to detect the Pacific UTC offset at noon on the given date —
  // correct year-round including the day DST flips.
  function pacificMidnightUTC(dateStr) {
    const noon = new Date(dateStr + 'T12:00:00Z');
    const pHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(noon),
      10
    );
    const offsetHours = 12 - pHour;
    const midnight = new Date(dateStr + 'T00:00:00Z');
    midnight.setUTCHours(offsetHours);
    return midnight;
  }

  function pacificDayUTCWindow(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const nextDateStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    return {
      start: pacificMidnightUTC(dateStr).toISOString(),
      end:   pacificMidnightUTC(nextDateStr).toISOString(),
    };
  }

  function formatLongDate(dateStr) {
    const [y, m, day] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  function formatShortDate(dateStr) {
    const [y, m, day] = dateStr.split('-');
    return `${+m}/${+day}/${y}`;
  }

  ns.dates = { todayLocal, weekRangeMonSun, addDays, pacificMidnightUTC, pacificDayUTCWindow, formatLongDate, formatShortDate };
})();
