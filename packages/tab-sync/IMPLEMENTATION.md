# Tab Sync - Implementation Details

## Architecture

The system uses a SharedWorker as a central coordination hub that maintains awareness of all connected browser tabs through a ping/pong heartbeat protocol. This creates a persistent coordination layer that survives individual tab closures and provides real-time synchronization across the browser session.

The core insight is that browser tabs are inherently isolated from each other, but many applications need some level of coordination between tabs. Rather than trying to work around this isolation, the system embraces it by using a SharedWorker as a central message broker that all tabs can communicate through.

## Communication Flow

The communication happens through a simple but effective pattern. Every 2 seconds, the SharedWorker sends a "ping" message to each connected tab containing the current list of all other tabs plus any optional extra data. Each tab responds with a "pong" message containing its current title and URL. The SharedWorker compares this information with what it knew before, and if anything changed, it immediately pings all the other tabs with the updated information.

This means changes propagate almost instantly. When a user navigates to a new page or changes the page title, all other connected tabs learn about it within the next ping cycle, and often much sooner if the change triggers an immediate broadcast.

## Activity Detection

Tabs are considered "active" if they respond to ping messages within 5 seconds. This simple timeout mechanism automatically handles cases where tabs become unresponsive due to browser suspension, crashes, or network issues. The system doesn't try to be too clever about distinguishing different types of unresponsiveness; it just removes tabs from the active list if they stop responding.

## State Management

Each tab maintains both static information (like its unique ID and creation timestamp) and dynamic information (like its current title and URL). The static information is set once when the tab connects and never changes. The dynamic information is automatically detected by reading `document.title` and `location.href` and is included in every pong response.

The system also supports broadcasting arbitrary extra data from the SharedWorker to all tabs through generic type support. This is useful for sharing connection status, server state, or other application-specific information that all tabs need to know about.

## Design Benefits

This design provides several important benefits. The SharedWorker persists even when individual tabs close, maintaining coordination state across the entire browser session. Changes propagate immediately without polling or manual triggers. The system only broadcasts when actual changes occur, keeping network traffic minimal. And the generic type support makes it extensible for application-specific coordination needs.