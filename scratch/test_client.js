// scratch/test_client.js
const wsUrl = 'ws://127.0.0.1:45667';
console.log(`[TEST CLIENT] Connecting to ${wsUrl}...`);

let ws;

function connect(clientName = 'Client 1') {
  ws = new WebSocket(wsUrl);

  ws.addEventListener('open', () => {
    console.log(`[TEST CLIENT] [${clientName}] Connected to Flow Deck Server`);
  });

  ws.addEventListener('message', (event) => {
    console.log(`[TEST CLIENT] [${clientName}] Received: ${event.data}`);
    try {
      const envelope = JSON.parse(event.data);
      if (envelope.type === 'PING') {
        console.log(`[TEST CLIENT] [${clientName}] Received PING. Replying with PONG...`);
        const pong = {
          type: 'PONG',
          payload: null,
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(pong));
      }
    } catch (e) {
      console.error(`[TEST CLIENT] [${clientName}] Error parsing message:`, e);
    }
  });

  ws.addEventListener('error', (event) => {
    console.error(`[TEST CLIENT] [${clientName}] WebSocket error:`, event.message || event);
  });

  ws.addEventListener('close', () => {
    console.log(`[TEST CLIENT] [${clientName}] WebSocket closed`);
  });
}

connect('Client 1');

// After 5 seconds, start second client to trigger replacement
setTimeout(() => {
  console.log('\n--- STARTING SECOND CLIENT FOR CONNECTION REPLACEMENT ---');
  const ws2 = new WebSocket(wsUrl);

  ws2.addEventListener('open', () => {
    console.log('[TEST CLIENT] [Client 2] Connected successfully');
  });

  ws2.addEventListener('message', (event) => {
    console.log(`[TEST CLIENT] [Client 2] Received: ${event.data}`);
    try {
      const envelope = JSON.parse(event.data);
      if (envelope.type === 'PING') {
        console.log('[TEST CLIENT] [Client 2] Received PING. Replying with PONG...');
        const pong = {
          type: 'PONG',
          payload: null,
          timestamp: Date.now()
        };
        ws2.send(JSON.stringify(pong));
      }
    } catch (e) {
      console.error('[TEST CLIENT] [Client 2] Error parsing:', e);
    }
  });

  ws2.addEventListener('close', () => {
    console.log('[TEST CLIENT] [Client 2] Closed');
  });
}, 5000);

// Exit process after 12 seconds to flush logs
setTimeout(() => {
  console.log('\n[TEST CLIENT] Exiting test script, flushing logs.');
  process.exit(0);
}, 12000);
