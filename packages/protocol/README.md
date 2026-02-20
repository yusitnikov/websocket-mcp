# @sitnikov/protocol

TypeScript support for typed message-based protocols between two parties.

## Purpose

When party **A** sends messages to party **B** over some channel (WebSocket, `postMessage`, etc.),
both sides need to agree on:

- which message types A can send
- what payload each message type carries
- what response B must return for each message type

A **contract** captures this agreement as a TypeScript type. The package then provides derived types and a dispatch helper so both sides get full type safety without duplication.

## Defining a contract

```typescript
import { satisfies } from "compare-versions";

type MyContract = {
    greet: {
        request: { name: string };
        response: { message: string };
    };
    ping: {
        request: {};
        response: {};
    };
};
```

## Sender side (party A)

Use `ProtocolRequest` and `ProtocolResponse` to type outgoing messages and expected replies:

```typescript
import type { ProtocolRequest, ProtocolResponse } from "@sitnikov/protocol";

const req: ProtocolRequest<MyContract, "greet"> = { type: "greet", name: "Alice" };
// response will be typed as { message: string }
const res: ProtocolResponse<MyContract, "greet"> = await send(req);
```

## Receiver side (party B)

Use `processRequestByProtocolImplementationMap` to dispatch incoming messages to typed handlers:

```typescript
import { processRequestByProtocolImplementationMap } from "@sitnikov/protocol";

const response = await processRequestByProtocolImplementationMap(incomingMessage, {
    greet: (req) => ({
        message: `Hello, ${req.name}!`,
    }),
    ping: async () => {
        await doSomethingAsync();
    },
});
```

Handlers can be sync or async — the return type of `processRequestByProtocolImplementationMap`
is inferred accordingly (sync map → sync result, async map → `Promise`).

The map must cover **every** key in the contract (enforced by TypeScript).
Throws `ProtocolUnknownRequest` if the `type` field matches no handler at runtime.
