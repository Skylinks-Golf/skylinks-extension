(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  // Wires modal.onRun to a validate → fetch → process → render pipeline.
  // modal.onRun handles button disable/enable and outer error display.
  function runReport({ modal, validate, fetch: fetchFn, process: processFn, render }) {
    modal.onRun(async (values, ctx) => {
      if (validate) {
        const err = validate(values);
        if (err) { ctx.setStatus(err, 'error'); return; }
      }

      modal.resetResult();
      ctx.setProgress(0);

      const started = Date.now();
      ns.logEvent && ns.logEvent('info', 'run', 'report started');
      try {
        const raw = await fetchFn(values, ctx);
        const processed = await processFn(raw, values);
        render(processed, values, modal);
        ns.logEvent && ns.logEvent('info', 'run', 'report finished', { ms: Date.now() - started });
      } catch (err) {
        const isAuth = err && err.code === 'AUTH';
        const msg = (err && err.message) ? err.message : 'An unexpected error occurred.';
        const suffix = isAuth ? '' : ' Open the Skylinks Tools popup, choose Copy log, and send it to Ian.';
        ctx.setStatus('❌ ' + msg + suffix, 'error');
        console.error('[Skylinks]', err);
        ns.logEvent && ns.logEvent('error', 'run', 'report failed', err);
        ctx.setProgress(0);
        modal.hideProgress();
        return;
      }
    });
  }

  ns.runReport = runReport;
})();
