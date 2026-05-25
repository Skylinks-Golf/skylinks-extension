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

      try {
        const raw = await fetchFn(values, ctx);
        const processed = await processFn(raw, values);
        render(processed, values, modal);
      } catch (err) {
        const isAuth = err && err.code === 'AUTH';
        const msg = (err && err.message) ? err.message : 'An unexpected error occurred.';
        const suffix = isAuth ? '' : ' Details in console.';
        ctx.setStatus('❌ ' + msg + suffix, 'error');
        console.error('[Skylinks]', err);
        ctx.setProgress(0);
        modal.hideProgress();
        return;
      }
    });
  }

  ns.runReport = runReport;
})();
