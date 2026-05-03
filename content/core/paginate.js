(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  // Ollama qwen2.5-coder:7b generated core structure; corrected sequential mode
  // and nextCursor defaults per spec.
  async function paginate(config) {
    const {
      fetchPage,
      start = 0,
      getItems,
      getTotal,
      pageSize = 100,
      hasMore,
      parallel = false,
    } = config;

    const nextCursor = config.nextCursor || (
      getTotal
        ? cursor => cursor + pageSize
        : cursor => cursor + 1
    );

    const toArr = ns.dom.toArr;
    let allItems = [];

    if (getTotal) {
      // Offset-style: known total → optionally fan out in parallel
      const firstPage = await fetchPage(start);
      allItems = toArr(getItems(firstPage));
      const total = getTotal(firstPage);
      const remaining = Math.ceil((total - allItems.length) / pageSize);

      if (remaining > 0) {
        const cursors = [];
        let cur = nextCursor(start);
        for (let i = 0; i < remaining; i++) {
          cursors.push(cur);
          cur = nextCursor(cur);
        }

        if (parallel) {
          const pages = await Promise.all(cursors.map(c => fetchPage(c)));
          for (const page of pages) allItems = allItems.concat(toArr(getItems(page)));
        } else {
          for (const c of cursors) {
            const page = await fetchPage(c);
            allItems = allItems.concat(toArr(getItems(page)));
          }
        }
      }
    } else if (hasMore) {
      // Sequential: fetch until hasMore returns false
      let cursor = start;
      while (true) {
        const page = await fetchPage(cursor);
        const items = toArr(getItems(page));
        allItems = allItems.concat(items);
        if (!hasMore(page, items)) break;
        cursor = nextCursor(cursor);
      }
    }

    return allItems;
  }

  ns.paginate = paginate;
})();
