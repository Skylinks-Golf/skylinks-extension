(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  ns.theme = {
    color: {
      brand:       '#eeb02b',
      brandText:   '#1c1b19',
      ink:         '#262b2f',
      muted:       '#475569',
      subtle:      '#94a3b8',
      success:     '#16a34a',
      successBg:   '#f0fdf4',
      error:       '#dc2626',
      errorBg:     '#fef2f2',
      warn:        '#d97706',
      warnText:    '#92400e',
      warnBg:      '#fffbeb',
      border:      '#d1d5db',
      borderSoft:  '#e2e8f0',
      cardBg:      '#fff',
      pageBg:      '#f8fafc',
      overlayBg:   'rgba(0,0,0,0.65)',
    },
    font: {
      ui:      '"Segoe UI",Tahoma,Geneva,Verdana,sans-serif',
      heading: "'Trebuchet MS','Segoe UI',Tahoma,sans-serif",
    },
    shadow: {
      card: '0 24px 64px rgba(0,0,0,0.35)',
    },
    radius: { card: '14px', input: '8px', pill: '99px' },
    z: { overlay: 999999 },
  };
})();
