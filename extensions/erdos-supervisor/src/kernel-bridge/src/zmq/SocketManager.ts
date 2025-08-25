/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * ZMQ Socket Manager for the Erdos Kernel Bridge
 * Handles all ZMQ socket communication with Jupyter kernels
 */

import * as zmq from 'zeromq';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { JupyterMessage, ConnectionInfo } from '../types';

export class ZMQSocketManager extends EventEmitter {
  private shellSocket!: zmq.Dealer;
  private iopubSocket!: zmq.Subscriber;
  private controlSocket!: zmq.Dealer;
  private stdinSocket!: zmq.Dealer;
  private heartbeatSocket!: zmq.Request;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isClosing = false;
  private messageHandlers = new Set<Promise<void>>();

  constructor(
    private sessionId: string,
    private connectionInfo: ConnectionInfo
  ) {
    super();
    this.setupSockets();
  }

  private async setupSockets(): Promise<void> {
    try {
      const { ip, transport } = this.connectionInfo;
      console.log('🔌 Setting up ZMQ sockets for session:', this.sessionId);
      console.log('📡 Connection info:', { ip, transport, ports: { 
        shell: this.connectionInfo.shell_port,
        iopub: this.connectionInfo.iopub_port,
        control: this.connectionInfo.control_port,
        stdin: this.connectionInfo.stdin_port,
        hb: this.connectionInfo.hb_port 
      }});
      
      // Shell socket - for execute_request, complete_request, etc.
      console.log('🔧 Creating shell socket...');
      this.shellSocket = new zmq.Dealer();
      await this.shellSocket.connect(`${transport}://${ip}:${this.connectionInfo.shell_port}`);
      this.startMessageHandler('shell', this.shellSocket, this.handleShellMessage.bind(this));
      console.log('✅ Shell socket connected');

      // IOPub socket - for status, execute_result, stream, etc.
      console.log('🔧 Creating iopub socket...');
      this.iopubSocket = new zmq.Subscriber();
      this.iopubSocket.subscribe(); // Subscribe to all messages
      await this.iopubSocket.connect(`${transport}://${ip}:${this.connectionInfo.iopub_port}`);
      this.startMessageHandler('iopub', this.iopubSocket, this.handleIOPubMessage.bind(this));
      console.log('✅ IOPub socket connected');

      // Control socket - for interrupt_request, shutdown_request, etc.
      this.controlSocket = new zmq.Dealer();
      await this.controlSocket.connect(`${transport}://${ip}:${this.connectionInfo.control_port}`);
      this.startMessageHandler('control', this.controlSocket, this.handleControlMessage.bind(this));

      // Stdin socket - for input_request/input_reply
      this.stdinSocket = new zmq.Dealer();
      await this.stdinSocket.connect(`${transport}://${ip}:${this.connectionInfo.stdin_port}`);
      this.startMessageHandler('stdin', this.stdinSocket, this.handleStdinMessage.bind(this));

      // Heartbeat socket - for kernel health monitoring
      this.heartbeatSocket = new zmq.Request();
      await this.heartbeatSocket.connect(`${transport}://${ip}:${this.connectionInfo.hb_port}`);
      this.startHeartbeat();

      console.log('🎉 All ZMQ sockets connected successfully!');
      this.emit('sockets_ready');
    } catch (error) {
      console.error('❌ ZMQ socket setup failed:', error);
      this.emit('setup_error', error);
      throw error;
    }
  }

  private startMessageHandler(
    channel: string,
    socket: zmq.Socket,
    handler: (frames: Buffer[]) => Promise<void>
  ): void {
    const handleMessages = async () => {
      while (!this.isClosing) {
        try {
          const frames = await (socket as any).receive();
          const messagePromise = handler(frames);
          this.messageHandlers.add(messagePromise);
          
          messagePromise.finally(() => {
            this.messageHandlers.delete(messagePromise);
          });

          await messagePromise;
        } catch (error) {
          if (!this.isClosing) {
            this.emit('message_error', { channel, error });
          }
          break;
        }
      }
    };

    handleMessages().catch((error) => {
      if (!this.isClosing) {
        this.emit('handler_error', { channel, error });
      }
    });
  }

  async sendMessage(channel: string, message: JupyterMessage): Promise<void> {
    if (this.isClosing) {
      throw new Error('Socket manager is closing');
    }

    try {
      const frames = this.serializeMessage(message);
      
      switch (channel) {
        case 'shell':
          await this.shellSocket.send(frames);
          break;
        case 'control':
          await this.controlSocket.send(frames);
          break;
        case 'stdin':
          await this.stdinSocket.send(frames);
          break;
        default:
          throw new Error(`Unknown channel: ${channel}`);
      }

      this.emit('message_sent', { channel, msg_id: message.header.msg_id });
    } catch (error) {
      this.emit('send_error', { channel, error, msg_id: message.header.msg_id });
      throw error;
    }
  }

  private serializeMessage(message: JupyterMessage): Buffer[] {
    const delimiter = Buffer.from('<IDS|MSG>');
    const header = Buffer.from(JSON.stringify(message.header));
    const parentHeader = Buffer.from(JSON.stringify(message.parent_header || {}));
    const metadata = Buffer.from(JSON.stringify(message.metadata));
    const content = Buffer.from(JSON.stringify(message.content));
    
    const hmac = this.calculateHMAC([header, parentHeader, metadata, content]);
    
    // Include ZMQ identities from message (required for ROUTER sockets)
    const frames: Buffer[] = [
      ...(message.zmq_identities || []),
      delimiter, 
      hmac, 
      header, 
      parentHeader, 
      metadata, 
      content, 
      ...(message.buffers || [])
    ];

    return frames;
  }

  private calculateHMAC(frames: Buffer[]): Buffer {
    if (!this.connectionInfo.key) {
      return Buffer.from('');
    }
    
    const hmac = crypto.createHmac('sha256', this.connectionInfo.key);
    frames.forEach(frame => hmac.update(new Uint8Array(frame)));
    return Buffer.from(hmac.digest('hex'));
  }

  private async handleShellMessage(frames: Buffer[]): Promise<void> {
    try {
      const message = this.deserializeMessage(frames);
      this.emit('shell_message', message);
    } catch (error) {
      this.emit('deserialization_error', { channel: 'shell', error });
    }
  }

  private async handleIOPubMessage(frames: Buffer[]): Promise<void> {
    try {
      const message = this.deserializeMessage(frames);
      this.emit('iopub_message', message);
    } catch (error) {
      this.emit('deserialization_error', { channel: 'iopub', error });
    }
  }

  private async handleControlMessage(frames: Buffer[]): Promise<void> {
    try {
      const message = this.deserializeMessage(frames);
      this.emit('control_message', message);
    } catch (error) {
      this.emit('deserialization_error', { channel: 'control', error });
    }
  }

  private async handleStdinMessage(frames: Buffer[]): Promise<void> {
    try {
      const message = this.deserializeMessage(frames);
      this.emit('stdin_message', message);
    } catch (error) {
      this.emit('deserialization_error', { channel: 'stdin', error });
    }
  }

  private deserializeMessage(frames: Buffer[]): JupyterMessage {
    const delimiter = new Uint8Array(Buffer.from('<IDS|MSG>'));
    const delimiterIndex = frames.findIndex(frame => Buffer.compare(new Uint8Array(frame), delimiter) === 0);
    if (delimiterIndex === -1) {
      throw new Error('Invalid message format: no delimiter found');
    }

    // Ensure we have enough frames after delimiter
    if (frames.length < delimiterIndex + 6) {
      throw new Error('Invalid message format: insufficient frames');
    }

    // Extract ZMQ identities (all frames before delimiter)
    const zmqIdentities = frames.slice(0, delimiterIndex);
    
    const hmacFrame = frames[delimiterIndex + 1];
    const headerFrame = frames[delimiterIndex + 2];
    const parentHeaderFrame = frames[delimiterIndex + 3];
    const metadataFrame = frames[delimiterIndex + 4];
    const contentFrame = frames[delimiterIndex + 5];
    const bufferFrames = frames.slice(delimiterIndex + 6);

    // Verify HMAC if key is present
    if (this.connectionInfo.key) {
      const expectedHmac = this.calculateHMAC([headerFrame, parentHeaderFrame, metadataFrame, contentFrame]);
      if (Buffer.compare(new Uint8Array(hmacFrame), new Uint8Array(expectedHmac)) !== 0) {
        throw new Error('HMAC verification failed');
      }
    }

    // Parse JSON frames
    let header, parentHeader, metadata, content;
    try {
      header = JSON.parse(headerFrame.toString());
      parentHeader = parentHeaderFrame.toString() ? JSON.parse(parentHeaderFrame.toString()) : undefined;
      metadata = JSON.parse(metadataFrame.toString());
      content = JSON.parse(contentFrame.toString());
    } catch (error) {
      throw new Error(`Failed to parse message JSON: ${error}`);
    }

    const message: JupyterMessage = {
      zmq_identities: zmqIdentities,
      header,
      parent_header: parentHeader,
      metadata,
      content
    };

    if (bufferFrames.length > 0) {
      message.buffers = bufferFrames;
    }

    return message;
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (this.isClosing) {
        return;
      }

      try {
        const startTime = Date.now();
        await this.heartbeatSocket.send([Buffer.from('ping')]);
        await this.heartbeatSocket.receive();
        const latency = Date.now() - startTime;
        
        this.emit('heartbeat_success', { latency });
      } catch (error) {
        this.emit('heartbeat_failed', error);
      }
    }, 3000); // 3-second ping/pong cycle
  }

  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Wait for all message handlers to complete
    if (this.messageHandlers.size > 0) {
      await Promise.allSettled(Array.from(this.messageHandlers));
    }

    // Close all sockets
    const closePromises: Promise<void>[] = [];

    if (this.shellSocket) {
      closePromises.push(Promise.resolve(this.shellSocket.close()));
    }
    if (this.iopubSocket) {
      closePromises.push(Promise.resolve(this.iopubSocket.close()));
    }
    if (this.controlSocket) {
      closePromises.push(Promise.resolve(this.controlSocket.close()));
    }
    if (this.stdinSocket) {
      closePromises.push(Promise.resolve(this.stdinSocket.close()));
    }
    if (this.heartbeatSocket) {
      closePromises.push(Promise.resolve(this.heartbeatSocket.close()));
    }

    await Promise.allSettled(closePromises);
    this.emit('closed');
  }

  // Utility methods for external access
  getSessionId(): string {
    return this.sessionId;
  }

  getConnectionInfo(): ConnectionInfo {
    return { ...this.connectionInfo };
  }

  isReady(): boolean {
    return !this.isClosing && 
           !!this.shellSocket && 
           !!this.iopubSocket && 
           !!this.controlSocket && 
           !!this.stdinSocket && 
           !!this.heartbeatSocket;
  }
}
