chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const body = document.getElementById('body');
    const url = tab.url || '';

    function injectScript(file) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
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

    } else {
        const msg = document.createElement('div');
        msg.className = 'error';
        msg.textContent = 'Navigate to Lightspeed Retail or Lightspeed Golf to use these tools.';
        body.appendChild(msg);
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Skylinks Golf Club';
    body.appendChild(hint);
});
