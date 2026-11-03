(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  ns.config = {
    lightspeed: {
      baseUrl:           'https://us.merchantos.com',
      fallbackAccountId: '305872',
      shopId:            '1',
      pagination:        { pageSize: 100, pageGuard: 50 },
    },
    selectpi: {
      // SelectPi stores its JWT in localStorage under this key.
      // Content scripts read it directly; no HTTP-only cookie alternative exists.
      localStorageTokenKey: 'token',
    },
    perfectVenue: {
      venueId: '15749',
      baseUrl: 'https://api.perfectvenue.com',
    },
    deputy: {
      baseUrl: 'https://348a3926020407.na.deputy.com',
    },
  };
})();
