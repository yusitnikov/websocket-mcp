# Tab Sync

A library for coordinating browser tabs using SharedWorkers. Tabs can discover each other, exchange messages, and stay synchronized across page reloads and navigation.

## Installation

```bash
npm install @sitnikov/tab-sync
```

## Quick Start

### In Your SharedWorker

```javascript
// worker.js
import { TabSyncServer } from "@sitnikov/tab-sync";

const server = new TabSyncServer({
    scope: self, // SharedWorkerGlobalScope
});

server.start();
```

### In Your Browser Tabs

```javascript
// main.js
import { TabSyncClient } from "@sitnikov/tab-sync";

const client = new TabSyncClient({
    sharedWorkerPath: "/worker.js",
});

// Listen for tab updates
client.onTabsChanged = (tabs) => {
    console.log("Connected tabs:", tabs);
    // Each tab has: { id, createdAt, dynamicInfo: { title, url } }
};

client.start();
```

## Configuration

### TabSyncClient Options

```javascript
const client = new TabSyncClient({
    sharedWorkerPath: "/worker.js", // Required: Path to SharedWorker script
    sharedWorkerOptions: {
        // Optional: SharedWorker options
        name: "My Tab Sync",
        type: "module",
    },
});
```

### TabSyncServer Options

```javascript
const server = new TabSyncServer({
    scope: self, // Required: SharedWorkerGlobalScope
    getExtraPingData: () => ({
        // Optional: Extra data to broadcast
        serverStatus: "connected",
        timestamp: Date.now(),
    }),
});
```

## API Reference

### TabSyncClient

#### Properties

- `tabs: TabInfo[]` - Array of all connected tabs (including current)
- `myTabInfo: TabInfo` - Information about the current tab

#### Methods

- `start(): void` - Connect to SharedWorker and begin synchronization
- `sendMessageToServer<PayloadT, ResponseT>(messageType: string, payload: PayloadT, timeout?: number): AbortablePromise<ResponseT>` - Send custom message to SharedWorker server
- `onCustomMessage<PayloadT, ResponseT>(messageType: string, handler: MessageHandler<undefined, PayloadT, ResponseT>): void` - Register handler for custom messages from server

#### Events

- `onTabsChanged?: (tabs: TabInfo[]) => void` - Called when tabs change
- `onExtraPingDataChanged?: (data: T) => void` - Called when extra data changes

### TabSyncServer

#### Properties

- `activeTabs: TabInfo[]` - Array of currently active tabs (within 5 second timeout)

#### Methods

- `start(): void` - Begin listening for tab connections
- `pingAllTabs(): void` - Manually ping all connected tabs
- `sendMessageToTab<PayloadT, ResponseT>(tabId: number, messageType: string, payload: PayloadT, timeout?: number): AbortablePromise<ResponseT>` - Send custom message to specific tab
- `onCustomMessage<PayloadT, ResponseT>(messageType: string, handler: MessageHandler<PartialTabInfo, PayloadT, ResponseT>): void` - Register handler for custom messages from tabs

### Types

```typescript
interface TabInfo {
    id: number; // Unique tab identifier
    createdAt: number; // Tab creation timestamp
    dynamicInfo: {
        title: string; // Current page title
        url: string; // Current page URL
    };
}
```

## Usage Patterns

### Basic Tab Awareness

```javascript
// Display connected tabs
client.onTabsChanged = (tabs) => {
    const tabList = tabs.map((tab) => `Tab ${tab.id} (${tab.dynamicInfo.hidden ? "hidden" : "visible"}): ${tab.dynamicInfo.title}`).join("\n");

    document.getElementById("tabs").textContent = tabList;
};
```

### Cross-Tab Communication with Extra Data

```javascript
// SharedWorker with extra data
const server = new TabSyncServer({
    scope: self,
    getExtraPingData: () => ({
        connectionStatus: wsConnected ? "online" : "offline",
        messageCount: messageQueue.length,
    }),
});

// Browser tab receiving extra data
client.onExtraPingDataChanged = (data) => {
    document.getElementById("status").textContent = data.connectionStatus;
    document.getElementById("messages").textContent = data.messageCount;
};
```

### Custom Messaging Between Tabs

Tabs can send typed messages to the SharedWorker and receive responses asynchronously. This enables request-response patterns where tabs ask the SharedWorker for data or request actions to be performed.

```javascript
// SharedWorker handles requests from tabs
server.onCustomMessage("getUserPrefs", async (userId, senderTab) => {
    const prefs = await loadUserPreferences(userId);
    return prefs;
});

// Tab sends message to SharedWorker and waits for response
const userPrefs = await client.sendMessageToServer("getUserPrefs", currentUserId);
```

The SharedWorker can also send messages to specific tabs and wait for their responses. This is useful for commanding tabs to perform UI actions or asking them about their current state.

```javascript
// SharedWorker asks a specific tab to show a notification
const result = await server.sendMessageToTab(tabId, "showNotification", {
    title: "Hello",
    message: "This is from another tab",
});

// Tab handles the notification request
client.onCustomMessage("showNotification", async (notification) => {
    new Notification(notification.title, { body: notification.message });
    return { shown: true, timestamp: Date.now() };
});
```

### Integration with Other Systems

```javascript
// Coordinate with WebSocket connections
const server = new TabSyncServer({
    scope: self,
    getExtraPingData: () => ({
        wsConnected: webSocket?.readyState === WebSocket.OPEN,
    }),
});

// Update tabs when WebSocket status changes
webSocket.addEventListener("open", () => server.pingAllTabs());
webSocket.addEventListener("close", () => server.pingAllTabs());
```

## Features

- **Automatic Discovery**: Tabs automatically detect each other when they connect
- **Real-time Updates**: Title and URL changes are broadcast immediately
- **Activity Detection**: Inactive tabs (no response for 5+ seconds) are filtered out
- **Generic Data Support**: Broadcast custom data from SharedWorker to all tabs
- **Custom Messaging**: Send typed messages between tabs and SharedWorker with async responses
- **Clean Lifecycle**: Proper cleanup when tabs close or refresh

## Browser Support

- **SharedWorker**: Requires browsers with SharedWorker support (Chrome, Firefox, Edge)
- **Modern Browsers**: Optimized for ES2018+ environments
- **Cross-Origin**: Handles same-origin requirements for SharedWorker

## Further Reading

- [Implementation Details](./IMPLEMENTATION.md) - Internal architecture and ping/pong protocol
- [SharedWorker Documentation](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
