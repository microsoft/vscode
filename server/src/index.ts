import { Buffer } from 'node:buffer';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

type SyncMessage = {
  type: 'sync';
  update: string;
  clientId?: string;
};

type AwarenessState = {
  uri: string;
  selectionStart: number;
  selectionEnd: number;
  username: string;
};

type AwarenessMessage = {
  type: 'awareness';
  clientId: string;
  state: AwarenessState | null;
};

type FsMessage =
  | { type: 'fs'; op: 'create'; uri: string; clientId?: string }
  | { type: 'fs'; op: 'delete'; uri: string; clientId?: string }
  | { type: 'fs'; op: 'rename'; uri: string; from: string; clientId?: string };

type Message = SyncMessage | AwarenessMessage | FsMessage | { type: 'welcome'; clientId: string; room: string };

interface RoomState {
  doc: Y.Doc;
  clients: Map<WebSocket, string>;
  awareness: Map<string, AwarenessState>;
}

const rooms = new Map<string, RoomState>();

function getRoom(name: string): RoomState {
  let room = rooms.get(name);
  if (!room) {
    room = {
      doc: new Y.Doc(),
      clients: new Map(),
      awareness: new Map()
    };
    rooms.set(name, room);
  }
  return room;
}

function broadcast(room: RoomState, sender: WebSocket, payload: Message & { clientId?: string }) {
  for (const [client, id] of room.clients.entries()) {
    if (client === sender || client.readyState !== WebSocket.OPEN) {
      continue;
    }
    const message = { ...payload, clientId: payload.clientId ?? room.clients.get(sender) ?? id };
    client.send(JSON.stringify(message));
  }
}

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer, path: '/' });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const roomName = url.searchParams.get('room') ?? 'default';
  const room = getRoom(roomName);
  const clientId = nanoid(8);

  room.clients.set(ws, clientId);

  ws.send(JSON.stringify({ type: 'welcome', clientId, room: roomName }));

  const sync = Y.encodeStateAsUpdate(room.doc);
  if (sync.byteLength > 0) {
    ws.send(JSON.stringify({ type: 'sync', update: Buffer.from(sync).toString('base64') }));
  }

  for (const [peerId, state] of room.awareness.entries()) {
    ws.send(JSON.stringify({ type: 'awareness', clientId: peerId, state }));
  }

  ws.on('message', (raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString();
    let message: Message;
    try {
      message = JSON.parse(text) as Message;
    } catch (error) {
      console.warn('Invalid message', error);
      return;
    }

    if (message.type === 'sync') {
      const update = Buffer.from(message.update, 'base64');
      Y.applyUpdate(room.doc, update);
      broadcast(room, ws, { type: 'sync', update: message.update, clientId });
    } else if (message.type === 'awareness') {
      if (message.state) {
        room.awareness.set(clientId, message.state);
      } else {
        room.awareness.delete(clientId);
      }
      broadcast(room, ws, { type: 'awareness', clientId, state: message.state });
    } else if (message.type === 'fs') {
      broadcast(room, ws, { ...message, clientId });
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    room.awareness.delete(clientId);
    broadcast(room, ws, { type: 'awareness', clientId, state: null });
    if (room.clients.size === 0) {
      rooms.delete(roomName);
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`cocode collab server listening on ws://localhost:${port}`);
});
