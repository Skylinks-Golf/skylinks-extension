(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  ns.config = {
    lightspeed: {
      fallbackAccountId: '305872',
      shopId:            '1',
      pagination:        { pageSize: 100, pageGuard: 50 },
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
