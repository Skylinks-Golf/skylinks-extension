(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  const ErrorCode = {
    AUTH:       'AUTH',
    NETWORK:    'NETWORK',
    HTTP:       'HTTP',
    SCHEMA:     'SCHEMA',
    RATE_LIMIT: 'RATE_LIMIT',
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

  function parseHttpError(resp, method, url) {
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
      message = `Request failed (${s}).`;
    }

    return new SkylinksError({
      code,
      message,
      detail: `${method} ${url} → ${s} ${resp.statusText}`,
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
  ns.parseNetworkError = parseNetworkError;
})();
