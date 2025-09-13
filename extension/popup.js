document.querySelector("button").addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.action.setIcon({ path: "icon2-16.png", tabId: tabs[0].id });
});
