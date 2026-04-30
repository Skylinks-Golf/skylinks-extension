chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const body = document.getElementById('body');
    const url = tab.url || '';

    function injectScript(file) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/utils.js', file] });
        window.close();
    }

    if (url.includes('us.merchantos.com')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-blue';
        btn.textContent = 'Sales Lines Report';
        btn.onclick = () => injectScript('content/merchantos.js');
        body.appendChild(btn);

    } else if (url.includes('chronogolf.ca')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-green';
        btn.textContent = 'Import Customers';
        btn.onclick = () => injectScript('content/chronogolf.js');
        body.appendChild(btn);

    } else if (url.includes('portal.getselectpi.com')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-purple';
        btn.textContent = 'Weekly Earnings Report';
        btn.onclick = () => injectScript('content/selectpi.js');
        body.appendChild(btn);

    } else if (url.includes('app.perfectvenue.com')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-orange';
        btn.textContent = 'Weekly Analytics Report';
        btn.onclick = () => injectScript('content/perfectvenue.js');
        body.appendChild(btn);

    } else if (url.includes('348a3926020407.na.deputy.com')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-teal';
        btn.textContent = 'Weekly Hours Report';
        btn.onclick = () => injectScript('content/deputy.js');
        body.appendChild(btn);

    } else {
        const msg = document.createElement('div');
        msg.className = 'error';
        msg.textContent = 'Navigate to Lightspeed Retail, Lightspeed Golf, the SelectPi Portal, Perfect Venue, or Deputy to use these tools.';
        body.appendChild(msg);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Skylinks Golf Club';
    body.appendChild(hint);
});
