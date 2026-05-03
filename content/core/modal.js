(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  const STATUS_COLORS = {
    info:    '#475569',
    error:   '#dc2626',
    success: '#16a34a',
    warn:    '#92400e',
  };

  function createModal(config) {
    const id = config.id;
    const theme = ns.theme;

    document.getElementById(`${id}-overlay`)?.remove();

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = `${id}-overlay`;
    overlay.style.cssText = `position:fixed;inset:0;background:${theme.color.overlayBg};z-index:${theme.z.overlay};display:flex;align-items:center;justify-content:center;font-family:${theme.font.ui};`;

    // Card
    const card = document.createElement('div');
    const width = config.variant === 'wide' ? 960 : (config.width || 560);
    card.style.cssText = `background:${theme.color.cardBg};border-radius:${theme.radius.card};box-shadow:${theme.shadow.card};padding:28px 32px;width:${width}px;max-width:97vw;max-height:90vh;overflow-y:auto;position:relative;`;

    // Wide variant: inject responsive CSS
    if (config.variant === 'wide') {
      document.getElementById(`${id}-responsive`)?.remove();
      const style = document.createElement('style');
      style.id = `${id}-responsive`;
      style.textContent = `@media(max-width:1020px){#${id}-overlay .sl-modal-card{width:98vw!important;}}`;
      document.head.appendChild(style);
    }

    // Header row (title + close button)
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;';

    const titleWrap = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.style.cssText = `margin:0;font-size:1.25rem;font-family:${theme.font.heading};color:${theme.color.ink};`;
    h2.textContent = `${config.emoji || ''} ${config.title}`.trim();
    titleWrap.appendChild(h2);
    if (config.description) {
      const desc = document.createElement('p');
      desc.style.cssText = `margin:6px 0 0;color:${theme.color.muted};font-size:0.875rem;`;
      desc.textContent = config.description;
      titleWrap.appendChild(desc);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `background:none;border:none;font-size:1.5rem;line-height:1;cursor:pointer;color:${theme.color.muted};padding:0 4px;margin-left:12px;flex-shrink:0;`;
    closeBtn.onclick = () => handle.close();

    headerRow.appendChild(titleWrap);
    headerRow.appendChild(closeBtn);
    card.appendChild(headerRow);

    // Body / fields
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'margin-bottom:12px;';

    if (config.body) {
      if (typeof config.body === 'string') {
        bodyEl.innerHTML = config.body;
      } else {
        bodyEl.appendChild(config.body);
      }
    } else if (config.fields && config.fields.length) {
      const isTwoDateGrid = config.fields.length === 2 &&
        config.fields.every(f => f.type === 'date') &&
        config.fields.some(f => f.id === 'start') &&
        config.fields.some(f => f.id === 'end');

      const fieldWrap = document.createElement('div');
      fieldWrap.style.cssText = isTwoDateGrid
        ? 'display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;'
        : 'display:flex;flex-direction:column;gap:10px;';

      config.fields.forEach(field => {
        const group = document.createElement('div');

        const lbl = document.createElement('label');
        lbl.htmlFor = `${id}-${field.id}`;
        lbl.textContent = field.label;
        lbl.style.cssText = `display:block;font-size:0.8125rem;font-weight:600;color:${theme.color.muted};margin-bottom:4px;`;

        const inp = document.createElement('input');
        inp.type = field.type || 'text';
        inp.id = `${id}-${field.id}`;
        inp.value = field.value || '';
        inp.style.cssText = `width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid ${theme.color.border};border-radius:${theme.radius.input};font-size:0.9375rem;`;

        group.appendChild(lbl);
        group.appendChild(inp);

        if (field.hint) {
          const hintEl = document.createElement('div');
          hintEl.style.cssText = `font-size:0.8rem;color:${theme.color.muted};margin-top:3px;`;
          const updateHint = () => { hintEl.textContent = field.hint(handle.values()); };
          inp.addEventListener('change', updateHint);
          updateHint();
          group.appendChild(hintEl);
        }

        fieldWrap.appendChild(group);
      });
      bodyEl.appendChild(fieldWrap);
    }

    card.appendChild(bodyEl);

    // Status line
    const statusEl = document.createElement('div');
    statusEl.style.cssText = `min-height:1.2em;font-size:0.875rem;color:${STATUS_COLORS.info};margin-bottom:6px;`;
    card.appendChild(statusEl);

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = `display:none;background:${theme.color.borderSoft};border-radius:${theme.radius.pill};overflow:hidden;height:6px;margin-bottom:10px;`;
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `height:100%;width:0%;background:${theme.color.brand};transition:width 0.2s;`;
    progressWrap.appendChild(progressBar);
    card.appendChild(progressWrap);

    // Result region
    const resultEl = document.createElement('div');
    resultEl.style.cssText = 'margin-top:8px;';
    card.appendChild(resultEl);

    // Run button
    let runBtn = null;
    if (config.runLabel !== null && config.runLabel !== undefined) {
      runBtn = document.createElement('button');
      runBtn.textContent = config.runLabel;
      runBtn.style.cssText = `margin-top:12px;padding:9px 22px;background:${theme.color.brand};color:${theme.color.brandText};border:none;border-radius:${theme.radius.input};font-weight:700;font-size:0.9375rem;cursor:pointer;`;
      card.appendChild(runBtn);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Dismiss handlers
    overlay.addEventListener('click', e => { if (e.target === overlay) handle.close(); });
    const escHandler = e => { if (e.key === 'Escape') handle.close(); };
    document.addEventListener('keydown', escHandler);

    const handle = {
      overlay,
      card,
      body: bodyEl,

      values() {
        const out = {};
        if (config.fields) {
          config.fields.forEach(f => {
            const el = document.getElementById(`${id}-${f.id}`);
            if (el) out[f.id] = el.value;
          });
        }
        return out;
      },

      setStatus(msg, kind = 'info') {
        statusEl.textContent = msg;
        statusEl.style.color = STATUS_COLORS[kind] || STATUS_COLORS.info;
      },

      setProgress(pct) {
        progressWrap.style.display = 'block';
        progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      },

      hideProgress() {
        progressWrap.style.display = 'none';
        progressBar.style.width = '0%';
      },

      showResult(htmlOrEl) {
        resultEl.innerHTML = '';
        if (typeof htmlOrEl === 'string') {
          resultEl.innerHTML = htmlOrEl;
        } else {
          resultEl.appendChild(htmlOrEl);
        }
      },

      resetResult() {
        resultEl.innerHTML = '';
      },

      onRun(handler) {
        if (!runBtn) return;
        runBtn.onclick = async () => {
          const vals = handle.values();
          const ctx = {
            setStatus: handle.setStatus.bind(handle),
            setProgress: handle.setProgress.bind(handle),
            showResult: handle.showResult.bind(handle),
            button: runBtn,
          };
          runBtn.disabled = true;
          runBtn.style.opacity = '0.4';
          try {
            await handler(vals, ctx);
          } catch (e) {
            handle.setStatus('❌ Error: ' + e.message, 'error');
            console.error(e);
          } finally {
            runBtn.disabled = false;
            runBtn.style.opacity = '1';
          }
        };
      },

      close() {
        document.removeEventListener('keydown', escHandler);
        if (config.onClose) config.onClose();
        if (config.variant === 'wide') document.getElementById(`${id}-responsive`)?.remove();
        overlay.remove();
      },
    };

    return handle;
  }

  ns.createModal = createModal;
})();
