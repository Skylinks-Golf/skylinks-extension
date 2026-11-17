// An extension-page module: no site tools, just buttons that open orders/app.html on any site.
SkylinksModules.register({
  id: 'orders',
  name: 'Pro Shop Orders',
  owner: 'Ian',
  pages: [
    { label: "Last Week's Sales", page: 'orders/app.html#sales' },
    { label: 'Money (Profit & Leaks)', page: 'orders/app.html#money' },
    { label: 'Add / Cut / Swap Ideas', page: 'orders/app.html#ideas' },
    { label: "This Week's Order", page: 'orders/app.html#order' },
  ],
});
