(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  // Validates an endpoint contract before expensive operations.
  // config: { name, checkFn, expectedKeys }
  // checkFn: async () => raw response object/array
  // expectedKeys: string[] to check on the resolved value
  async function runPreflight({ name, checkFn, expectedKeys = [] }) {
    let result;
    try {
      result = await checkFn();
    } catch (err) {
      if (err && err.code === 'AUTH') throw err;
      if (err && err.code === 'NETWORK') throw err;
      throw new ns.SkylinksError({
        code:    ns.ErrorCode.NETWORK,
        message: `Preflight "${name}" failed. Check your connection.`,
        detail:  err ? err.message : String(err),
      });
    }

    if (result === null || result === undefined) {
      throw new ns.SkylinksError({
        code:    ns.ErrorCode.SCHEMA,
        message: `Preflight "${name}" returned empty response.`,
        detail:  `Expected non-null response from ${name}`,
      });
    }

    const missing = expectedKeys.filter(k => !(k in Object(result)));
    if (missing.length) {
      throw new ns.SkylinksError({
        code:    ns.ErrorCode.SCHEMA,
        message: `Preflight "${name}" failed: unexpected response shape.`,
        detail:  `Missing keys: ${missing.join(', ')}`,
      });
    }
  }

  ns.runPreflight = runPreflight;
})();
