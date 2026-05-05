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

      const raw = await fetchFn(values, ctx);
      const processed = await processFn(raw, values);
      render(processed, values, modal);
    });
  }

  ns.runReport = runReport;
})();
