let activeTabId;

function getTabInfo(tabId) {
    chrome.tabs.get(tabId, function (tab) {
        const url = tab.url
        const allowedUrl = ['https://rms.naukri.com/admin/homePage', 'https://employers.indeed.com/j#jobs']

        if (allowedUrl.includes(url)) {
            chrome.action.setIcon({ path: "/img/icon.png" });
            chrome.action.enable();
            // send current portal information
            if (url === allowedUrl[0]) {
                const portal = 'naukri';
                chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, { portal }, function () { });
                });
            } else if (url === allowedUrl[1]) {
                chrome.cookies.getAll({
                    domain: ".indeed.com"
                }, function (cookies) {
                    var stringArray = ["PPID", "SOCK", "SHOE", "CSRF"];
                    for (var i = 0; i < cookies.length; i++) {
                        if (stringArray.indexOf(cookies[i].name) > -1) {
                            const c = JSON.stringify(cookies[i])
                            const portal = url.split('.')[1]

                            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                                chrome.tabs.sendMessage(tabs[0].id, { c, portal }, function () { });
                            });
                        }
                    }
                });
            }
        } else {
            chrome.action.setIcon({ path: "/img/icongray.png" });
            chrome.action.disable();
        }
    });
}

chrome.tabs.onActivated.addListener(function (activeInfo) {
    setTimeout(() => {
        getTabInfo(activeTabId = activeInfo.tabId);
    }, 300);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (activeTabId == tabId) {
        getTabInfo(tabId);
    }
});
