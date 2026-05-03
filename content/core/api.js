(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  function apiClient(config) {
    const baseUrl = config.baseUrl || '';
    const auth = config.auth || 'cookie';
    const defaultHeaders = config.defaultHeaders || {};
    const retryConfig = config.retry || { attempts: 0, delayMs: 1000, methods: ['GET'] };

    function buildAuthInit() {
      // Returns fetch-init fragments (credentials, headers) for the configured auth strategy.
      if (auth === 'cookie') return { credentials: 'include', headers: {} };
      if (typeof auth.bearer === 'string') return { credentials: 'same-origin', headers: { Authorization: `Bearer ${auth.bearer}` } };
      if (typeof auth.bearerFromLocalStorage === 'string') {
        const tok = localStorage.getItem(auth.bearerFromLocalStorage);
        return { credentials: 'same-origin', headers: tok ? { Authorization: `Bearer ${tok}` } : {} };
      }
      if (typeof auth.csrf === 'function') return { credentials: 'include', headers: { 'X-CSRF-Token': auth.csrf() } };
      return { credentials: 'same-origin', headers: {} };
    }

    function buildUrl(path, query) {
      const url = baseUrl ? `${baseUrl}${path}` : path;
      if (!query || !Object.keys(query).length) return url;
      return `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(query)}`;
    }

    async function doFetch(method, url, body, extraHeaders) {
      const { credentials, headers: authHdrs } = buildAuthInit();
      const headers = { ...defaultHeaders, ...authHdrs, ...extraHeaders };
      const init = { method, credentials, headers };
      if (body !== undefined && body !== null) {
        init.body = typeof body === 'object' ? JSON.stringify(body) : body;
        if (!headers['Content-Type'] && typeof body === 'object') {
          headers['Content-Type'] = 'application/json';
        }
      }
      const resp = await fetch(url, init);
      if (!resp.ok) throw new Error(`${method} ${url} → ${resp.status} ${resp.statusText}`);
      return resp;
    }

    async function fetchWithRetry(method, url, body, extraHeaders, overrideRetry) {
      const r = overrideRetry || retryConfig;
      const methods = r.methods || ['GET'];
      const maxAttempts = r.attempts || 0;
      let attempt = 0;
      while (true) {
        try {
          return await doFetch(method, url, body, extraHeaders);
        } catch (err) {
          if (attempt < maxAttempts && methods.includes(method)) {
            attempt++;
            await new Promise(res => setTimeout(res, r.delayMs || 1000));
          } else {
            throw err;
          }
        }
      }
    }

    return {
      async get(path, { headers = {}, query = {}, retry } = {}) {
        const url = buildUrl(path, query);
        const resp = await fetchWithRetry('GET', url, null, headers, retry);
        return resp.json();
      },

      async post(path, body, { headers = {}, retry } = {}) {
        const url = buildUrl(path);
        const resp = await fetchWithRetry('POST', url, body, headers, retry);
        return resp.json();
      },

      async graphql(path, { query, variables = {}, operationName } = {}) {
        const url = buildUrl(path);
        const resp = await fetchWithRetry('POST', url, { query, variables, operationName }, {});
        const data = await resp.json();
        if (data.errors && data.errors.length) {
          throw new Error(data.errors.map(e => e.message).join('; '));
        }
        return data.data;
      },

      raw(path, init) {
        const url = buildUrl(path);
        return fetch(url, init);
      },
    };
  }

  ns.apiClient = apiClient;
})();
