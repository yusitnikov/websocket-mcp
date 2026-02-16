import { BrowserTabClient } from "@sitnikov/browser-automation/tab-client";

// DOM elements
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const connectionStatus = document.getElementById("connection-status") as HTMLDivElement;
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const connectionId = document.getElementById("connection-id") as HTMLSpanElement;

// Create browser tab client
const client = new BrowserTabClient("ws://localhost:3004");

// Update UI when connected
client.onConnected = (id) => {
    console.log("Connected to broker with ID:", id);
    connectionStatus.innerHTML = '<span class="success">✓ Connected to broker</span>';
    connectionId.textContent = id;
};

// Update UI when disconnected
client.onDisconnected = () => {
    console.log("Disconnected from broker");
    connectionStatus.innerHTML = '<span class="error">✗ Disconnected from broker</span>';
    connectionId.textContent = "-";
};

// Connect to broker
try {
    await client.connect();
    console.log("Browser tab client initialized");
} catch (error) {
    console.error("Failed to connect to broker:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    connectionStatus.innerHTML = `<span class="error">✗ Connection failed: ${errorMessage}</span>`;
}
