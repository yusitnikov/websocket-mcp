import { log } from "@main/utils.js";
import { McpServerPingData } from "./types.ts";
import { TabSyncClient } from "@main/tab-sync/TabSyncClient.ts";

// DOM elements
const swStatus = document.getElementById("sw-status") as HTMLDivElement;
const mcpStatus = document.getElementById("mcp-status") as HTMLDivElement;
const currentTabId = document.getElementById("current-tab-id") as HTMLSpanElement;
const tabCount = document.getElementById("tab-count") as HTMLSpanElement;
const tabsTbody = document.getElementById("tabs-tbody") as HTMLTableSectionElement;

// Extract name from URL hash (everything after #)
const serverName = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "demo";

const tabSyncClient = new TabSyncClient<McpServerPingData>({
    sharedWorkerPath: `/src/shared-worker.ts?serverName=${encodeURIComponent(serverName)}`,
    sharedWorkerOptions: {
        name: `MCP server + tabs sync (${serverName})`,
        type: "module",
    },
});

tabSyncClient.onTabsChanged = (tabs) => {
    // Update tab info
    currentTabId.textContent = String(tabSyncClient.myTabInfo.id);
    tabCount.textContent = tabs.length.toString();

    // Update tab table
    tabsTbody.innerHTML = "";
    tabs.forEach((tab) => {
        const row = document.createElement("tr");

        if (tab.id === tabSyncClient.myTabInfo.id) {
            row.style.backgroundColor = "#e3f2fd";
        }

        const idCell = document.createElement("td");
        idCell.textContent = String(tab.id);

        const titleCell = document.createElement("td");
        titleCell.textContent = tab.dynamicInfo.title;

        const createdCell = document.createElement("td");
        createdCell.textContent = new Date(tab.createdAt).toLocaleTimeString();

        row.appendChild(idCell);
        row.appendChild(titleCell);
        row.appendChild(createdCell);
        tabsTbody.appendChild(row);
    });
};

tabSyncClient.onExtraPingDataChanged = ({ connected }) => {
    if (connected) {
        mcpStatus.innerHTML = '<span class="success">✓ Connected to MCP server</span>';
    } else {
        mcpStatus.innerHTML = '<span class="warning">⚠ Not connected to MCP server</span>';
    }
};

try {
    tabSyncClient.start();

    log("SharedWorker connected");
    swStatus.innerHTML = '<span class="success">✓ SharedWorker connected and active</span>';
} catch (error) {
    log("SharedWorker connection failed:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    swStatus.innerHTML = `<span class="error">✗ SharedWorker connection failed: ${errorMessage}</span>`;
    mcpStatus.innerHTML = "";
}
