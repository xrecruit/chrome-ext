let activeTabId;

function getTabInfo(tabId) {
    chrome.tabs.get(tabId, function (tab) {
        const url = tab.url
        const allowedUrl = 'https://rms.naukri.com/admin/homePage'

        if (url === allowedUrl) {
            chrome.action.setIcon({ path: "/img/icon.png" });
            chrome.action.enable();
        } else {
            chrome.action.setIcon({ path: "/img/icongray.png" });
            chrome.action.disable();
        }
    });
}

chrome.tabs.onActivated.addListener(function (activeInfo) {
    getTabInfo(activeTabId = activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (activeTabId == tabId) {
        getTabInfo(tabId);
    }
});
