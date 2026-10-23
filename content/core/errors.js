(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  const ErrorCode = {
    AUTH:       'AUTH',
    NETWORK:    'NETWORK',
    HTTP:       'HTTP',
    SCHEMA:     'SCHEMA',
    RATE_LIMIT: 'RATE_LIMIT',
    TIMEOUT:    'TIMEOUT',
    VALIDATION: 'VALIDATION',
    UNKNOWN:    'UNKNOWN',
  };

  class SkylinksError extends Error {
    constructor({ code, message, detail, status } = {}) {
      super(message || 'An unexpected error occurred.');
      this.name = 'SkylinksError';
      this.code   = code   || ErrorCode.UNKNOWN;
      this.detail = detail || '';
      this.status = status || null;
    }
  }

  // Pull a human-readable reason out of an error response body. Handles the
  // shapes seen across vendors: {errors:[{message}]}, {errors:{field:[msg]}},
  // {errors:'msg'}, {error:{message}}, {error:'msg'}, {message}. Falls back to
  // a trimmed slice of the raw text.
  function extractErrorMessage(text) {
    if (!text) return '';
    let data;
    try { data = JSON.parse(text); } catch (_) { return String(text).trim().slice(0, 200); }
    const errs = data?.errors;
    if (Array.isArray(errs)) {
      return errs.map(e => (typeof e === 'string' ? e : e?.message || JSON.stringify(e))).join('; ');
    }
    if (errs && typeof errs === 'object') {
      return Object.entries(errs)
        .map(([field, v]) => `${field} ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('; ');
    }
    if (typeof errs === 'string') return errs;
    if (typeof data?.error === 'string') return data.error;
    if (data?.error?.message) return data.error.message;
    if (data?.message) return data.message;
    return String(text).trim().slice(0, 200);
  }

  function parseHttpError(resp, method, url, bodyMsg = '') {
    const s = resp.status;
    let code = ErrorCode.HTTP;
    let message;

    if (s === 401 || s === 403) {
      code    = ErrorCode.AUTH;
      message = 'Authentication required. Please reload the page and try again.';
    } else if (s === 429) {
      code    = ErrorCode.RATE_LIMIT;
      message = 'Rate limit reached. Please wait a moment and try again.';
    } else if (s >= 500) {
      message = `Server error (${s}). Please try again.`;
    } else {
      message = bodyMsg ? `Request failed (${s}): ${bodyMsg}` : `Request failed (${s}).`;
    }

    return new SkylinksError({
      code,
      message,
      detail: `${method} ${url} → ${s} ${resp.statusText}${bodyMsg ? ' — ' + bodyMsg : ''}`,
      status: s,
    });
  }

  function parseNetworkError(err, method, url) {
    return new SkylinksError({
      code:    ErrorCode.NETWORK,
      message: 'Network error. Check your connection and try again.',
      detail:  `${method} ${url}: ${err.message}`,
    });
  }

  ns.SkylinksError  = SkylinksError;
  ns.ErrorCode      = ErrorCode;
  ns.parseHttpError = parseHttpError;
  ns.extractErrorMessage = extractErrorMessage;
  ns.parseNetworkError = parseNetworkError;
})();
