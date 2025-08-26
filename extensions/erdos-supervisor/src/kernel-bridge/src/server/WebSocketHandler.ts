/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * WebSocket Handler for the Erdos Kernel Bridge
 * Handles WebSocket connections and message routing for Python and Ark kernels
 */

import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { JupyterMessage } from '../types';

export interface WebSocketMetrics {
  messagesReceived: number;
  messagesSent: number;
  errorsEncountered: number;
  bytesReceived: number;
  bytesSent: number;
  connectionTime: Date;
  lastActivityTime: Date;
}

export interface WebSocketHandlerOptions {
  heartbeatInterval?: number; // Heartbeat interval in milliseconds
  messageTimeout?: number; // Message processing timeout
  maxMessageSize?: number; // Maximum message size in bytes
  pingInterval?: number; // WebSocket ping interval
  enableCompression?: boolean; // Enable WebSocket compression
}

export class WebSocketHandler extends EventEmitter {
  public readonly sessionId: string;
  private metrics: WebSocketMetrics;
  private options: Required<WebSocketHandlerOptions>;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isClosing = false;
  private messageQueue: Array<{ message: any; timestamp: number }> = [];
  private processingMessage = false;

  constructor(
    private ws: WebSocket,
    sessionId: string,
    options?: WebSocketHandlerOptions
  ) {
    super();
    
    this.sessionId = sessionId;
    this.options = {
      heartbeatInterval: 30000, // 30 seconds
      messageTimeout: 10000, // 10 seconds
      maxMessageSize: 10 * 1024 * 1024, // 10MB
      pingInterval: 15000, // 15 seconds
      enableCompression: true,
      ...options
    };

    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      errorsEncountered: 0,
      bytesReceived: 0,
      bytesSent: 0,
      connectionTime: new Date(),
      lastActivityTime: new Date()
    };

    this.setupWebSocket();
    this.startHeartbeat();
    this.startPing();
  }

  private setupWebSocket(): void {
    // Configure WebSocket options
    if (this.options.enableCompression && this.ws.extensions) {
      // Compression is handled by the ws library automatically
    }

    // Handle incoming messages
    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleRawMessage(data);
    });

    // Handle connection close
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.handleClose(code, reason.toString());
    });

    // Handle WebSocket errors
    this.ws.on('error', (error: Error) => {
      this.handleError(error);
    });

    // Handle WebSocket pong responses
    this.ws.on('pong', (data: Buffer) => {
      this.handlePong(data);
    });

    // Handle WebSocket ping (if we receive one)
    this.ws.on('ping', (data: Buffer) => {
      this.handlePing(data);
    });

    this.emit('websocket_connected', {
      sessionId: this.sessionId,
      remoteAddress: this.getRemoteAddress(),
      userAgent: this.getUserAgent()
    });
  }

  private handleRawMessage(data: WebSocket.Data): void {
    try {
      const messageSize = Buffer.byteLength(data.toString());
      
      // Check message size limit
      if (messageSize > this.options.maxMessageSize) {
        this.sendError(`Message too large: ${messageSize} bytes (max: ${this.options.maxMessageSize})`);
        return;
      }

      // Update metrics
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += messageSize;
      this.metrics.lastActivityTime = new Date();

      // Parse JSON message
      const messageStr = data.toString();
      let parsedMessage: any;
      
      try {
        parsedMessage = JSON.parse(messageStr);
        console.log(`WD_TRACE_KB_REAL: Raw message parsed - kind: ${parsedMessage.kind}, type: ${parsedMessage.type}, header.msg_type: ${parsedMessage.header?.msg_type}`);
      } catch (parseError) {
        this.metrics.errorsEncountered++;
        this.sendError(`Invalid JSON message: ${parseError}`);
        this.emit('message_parse_error', {
          sessionId: this.sessionId,
          error: parseError,
          rawData: messageStr.substring(0, 1000) // Truncate for logging
        });
        return;
      }

      // Queue message for processing
      this.queueMessage(parsedMessage);

    } catch (error) {
      this.metrics.errorsEncountered++;
      this.emit('message_handling_error', {
        sessionId: this.sessionId,
        error
      });
    }
  }

  private queueMessage(message: any): void {
    this.messageQueue.push({
      message,
      timestamp: Date.now()
    });

    this.processMessageQueue();
  }

  private async processMessageQueue(): Promise<void> {
    if (this.processingMessage || this.messageQueue.length === 0) {
      return;
    }

    this.processingMessage = true;

    try {
      while (this.messageQueue.length > 0 && !this.isClosing) {
        const { message, timestamp } = this.messageQueue.shift()!;
        
        // Check for message timeout
        const messageAge = Date.now() - timestamp;
        if (messageAge > this.options.messageTimeout) {
          this.emit('message_timeout', {
            sessionId: this.sessionId,
            messageType: message.type,
            age: messageAge
          });
          continue;
        }

        await this.handleIncomingMessage(message);
      }
    } finally {
      this.processingMessage = false;
    }
  }

  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        this.sendError('Message must be a JSON object');
        return;
      }

      // ERDOS COMPATIBILITY: Detect raw Jupyter messages and auto-wrap them
      // Erdos sends raw Jupyter protocol messages instead of wrapped messages
      if (!message.type && message.header && message.header.msg_type) {
        console.log(`WD_TRACE_KB_REAL: Raw Jupyter message detected - type: ${message.header.msg_type}, channel: ${message.channel}`);
        
        // Transform raw Jupyter message into expected format
        const wrappedMessage = {
          type: 'jupyter_message',
          channel: message.channel || 'shell', // Default to shell channel if not specified
          message: {
            header: message.header,
            parent_header: message.parent_header,
            metadata: message.metadata || {},
            content: message.content,
            buffers: message.buffers || []
          }
        };
        
        // Process the wrapped message
        await this.handleJupyterMessage(wrappedMessage);
        return;
      }

      // Standard message handling for properly formatted messages
      if (!message.type) {
        this.sendError('Message must have a type field');
        return;
      }

      this.emit('message_received', {
        sessionId: this.sessionId,
        messageType: message.type,
        timestamp: new Date()
      });

      // Handle different message types
      switch (message.type) {
        case 'create_session':
          await this.handleCreateSession(message);
          break;
          
        case 'jupyter_message':
          await this.handleJupyterMessage(message);
          break;
          
        case 'heartbeat':
          this.handleHeartbeat(message);
          break;
          
        case 'ping':
          this.handleClientPing(message);
          break;
          
        case 'subscribe':
          this.handleSubscribe(message);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribe(message);
          break;
          
        case 'kernel_interrupt':
          await this.handleKernelInterrupt(message);
          break;
          
        case 'kernel_restart':
          await this.handleKernelRestart(message);
          break;
          
        default:
          this.sendError(`Unknown message type: ${message.type}`);
          this.emit('unknown_message_type', {
            sessionId: this.sessionId,
            messageType: message.type,
            message
          });
      }
    } catch (error) {
      this.metrics.errorsEncountered++;
      this.emit('message_processing_error', {
        sessionId: this.sessionId,
        error,
        message
      });
      this.sendError(`Message processing error: ${error}`);
    }
  }

  private async handleJupyterMessage(message: any): Promise<void> {
    // Debug: Log ALL Jupyter messages to see what's flowing through
    const jupyterMsg = message.message;
    console.log(`WD_TRACE_KB_REAL: WebSocketHandler received Jupyter message - sessionId: ${this.sessionId}, channel: ${message.channel}, type: ${jupyterMsg?.header?.msg_type}`);
    
    // Special handling for comm_msg
    if (jupyterMsg?.header?.msg_type === 'comm_msg') {
      console.log(`WD_TRACE_KB_REAL: comm_msg content:`, JSON.stringify(jupyterMsg.content, null, 2));
      
      // Check specifically for working directory messages
      const content = jupyterMsg.content as any;
      if (content && content.data && content.data.method === 'working_directory') {
        console.log(`WD_TRACE_KB_REAL: FOUND WORKING DIRECTORY MESSAGE!`, JSON.stringify(content.data, null, 2));
      }
    } else if (jupyterMsg?.header?.msg_type === 'stream') {
      // Log stream messages (like print output)
      console.log(`WD_TRACE_KB_REAL: stream message - name: ${jupyterMsg.content?.name}, text: "${jupyterMsg.content?.text}"`);
    } else {
      // Log other message types briefly
      console.log(`WD_TRACE_KB_REAL: ${jupyterMsg?.header?.msg_type} message received`);
    }

    // Validate Jupyter message structure
    if (!message.channel) {
      this.sendError('Jupyter message must have a channel field');
      return;
    }

    if (!message.message) {
      this.sendError('Jupyter message must have a message field');
      return;
    }

    // Validate channel
    const validChannels = ['shell', 'iopub', 'control', 'stdin'];
    if (!validChannels.includes(message.channel)) {
      this.sendError(`Invalid channel: ${message.channel}. Must be one of: ${validChannels.join(', ')}`);
      return;
    }

    // Validate Jupyter message structure
    const jupyterMessage = message.message as JupyterMessage;
    if (!jupyterMessage.header || !jupyterMessage.header.msg_type) {
      this.sendError('Jupyter message must have a valid header with msg_type');
      return;
    }

    // Emit jupyter_message event for SessionManager to handle
    this.emit('jupyter_message', {
      sessionId: this.sessionId,
      channel: message.channel,
      message: jupyterMessage,
      timestamp: new Date()
    });
  }

  private handleHeartbeat(_message: any): void {
    // Respond to heartbeat
    this.send({
      type: 'heartbeat',
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metrics: {
        messagesReceived: this.metrics.messagesReceived,
        messagesSent: this.metrics.messagesSent,
        uptime: Date.now() - this.metrics.connectionTime.getTime()
      }
    });
  }

  private handleClientPing(message: any): void {
    // Respond to client ping
    this.send({
      type: 'pong',
      timestamp: Date.now(),
      requestId: message.requestId
    });
  }

  private handleSubscribe(message: any): void {
    // Handle subscription to specific message types or channels
    const { channels, messageTypes } = message;
    
    this.emit('client_subscribe', {
      sessionId: this.sessionId,
      channels: channels || [],
      messageTypes: messageTypes || []
    });

    this.send({
      type: 'subscribe_ack',
      channels: channels || [],
      messageTypes: messageTypes || []
    });
  }

  private handleUnsubscribe(message: any): void {
    // Handle unsubscription
    const { channels, messageTypes } = message;
    
    this.emit('client_unsubscribe', {
      sessionId: this.sessionId,
      channels: channels || [],
      messageTypes: messageTypes || []
    });

    this.send({
      type: 'unsubscribe_ack',
      channels: channels || [],
      messageTypes: messageTypes || []
    });
  }

  private async handleKernelInterrupt(message: any): Promise<void> {
    // Emit kernel interrupt request
    this.emit('kernel_interrupt_request', {
      sessionId: this.sessionId,
      requestId: message.requestId
    });
  }

  private async handleKernelRestart(message: any): Promise<void> {
    // Emit kernel restart request
    this.emit('kernel_restart_request', {
      sessionId: this.sessionId,
      requestId: message.requestId
    });
  }

  send(message: any): boolean {
    if (this.isClosing || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('send_failed', {
        sessionId: this.sessionId,
        reason: 'websocket_not_open',
        readyState: this.ws.readyState
      });
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageStr);

      // Update metrics
      this.metrics.messagesSent++;
      this.metrics.bytesSent += messageSize;
      this.metrics.lastActivityTime = new Date();

      this.ws.send(messageStr);

      this.emit('message_sent', {
        sessionId: this.sessionId,
        messageType: message.type,
        size: messageSize,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      this.metrics.errorsEncountered++;
      this.emit('send_error', {
        sessionId: this.sessionId,
        error,
        message
      });
      return false;
    }
  }

  sendError(error: string, code?: number): boolean {
    return this.send({
      type: 'error',
      error,
      code: code || 1000,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  sendJupyterMessage(channel: string, jupyterMessage: JupyterMessage): boolean {
    // ERDOS COMPATIBILITY: Use 'kind' field instead of 'type' for Jupyter messages
    // Erdos expects {kind: 'jupyter'} format, not {type: 'jupyter_message'}
    const wsMessage = {
      kind: 'jupyter',
      channel: channel as any,
      ...jupyterMessage  // Spread the Jupyter message fields directly
    };

    return this.send(wsMessage);
  }

  sendStatus(status: 'connected' | 'disconnected' | 'error' | 'idle' | 'busy'): boolean {
    return this.send({
      type: 'status',
      status,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });
  }

  private handleClose(code: number, reason: string): void {
    this.cleanup();
    
    this.emit('websocket_closed', {
      sessionId: this.sessionId,
      code,
      reason,
      metrics: { ...this.metrics }
    });

    this.emit('disconnect', this.sessionId);
  }

  private handleError(error: Error): void {
    this.metrics.errorsEncountered++;
    
    this.emit('websocket_error', {
      sessionId: this.sessionId,
      error,
      metrics: { ...this.metrics }
    });

    // Don't automatically close on error - let the client decide
  }

  private handlePong(data: Buffer): void {
    this.emit('websocket_pong', {
      sessionId: this.sessionId,
      data: data.toString(),
      timestamp: new Date()
    });
  }

  private handlePing(data: Buffer): void {
    // Respond to ping with pong
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.pong(data);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.isClosing && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'heartbeat',
          timestamp: Date.now(),
          sessionId: this.sessionId
        });
      }
    }, this.options.heartbeatInterval);
  }

  private startPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (!this.isClosing && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.options.pingInterval);
  }

  close(code?: number, reason?: string): void {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    
    this.cleanup();
    
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close(code || 1000, reason || 'Normal closure');
    }
  }

  private cleanup(): void {
    this.isClosing = true;
    
    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Clear message queue
    this.messageQueue = [];
    this.processingMessage = false;
  }

  // Utility methods
  isConnected(): boolean {
    return !this.isClosing && this.ws.readyState === WebSocket.OPEN;
  }

  getReadyState(): number {
    return this.ws.readyState;
  }

  getMetrics(): WebSocketMetrics {
    return { ...this.metrics };
  }

  getRemoteAddress(): string {
    return (this.ws as any)._socket?.remoteAddress || 'unknown';
  }

  getUserAgent(): string {
    return (this.ws as any).upgradeReq?.headers['user-agent'] || 'unknown';
  }

  getConnectionUptime(): number {
    return Date.now() - this.metrics.connectionTime.getTime();
  }

  getLastActivityAge(): number {
    return Date.now() - this.metrics.lastActivityTime.getTime();
  }

  // Protocol-specific helpers for Ark and Python kernels
  isKernelReady(): boolean {
    return this.isConnected() && !this.isClosing;
  }

  supportsKernelType(kernelType: 'python' | 'ark'): boolean {
    // Both kernel types are supported through the same WebSocket interface
    return kernelType === 'python' || kernelType === 'ark';
  }

  private async handleCreateSession(message: any): Promise<void> {
    try {
      // Validate required fields
      if (!message.session_id) {
        this.sendError('create_session message must have session_id field');
        return;
      }
      
      if (!message.kernel_spec) {
        this.sendError('create_session message must have kernel_spec field');
        return;
      }

      // Send session creation started status
      this.send({
        type: 'session_status',
        status: 'creating',
        session_id: message.session_id,
        timestamp: new Date().toISOString()
      });

      // Emit session creation event for SessionManager to handle
      this.emit('create_session', {
        sessionId: message.session_id,
        kernelSpec: message.kernel_spec,
        metadata: message.metadata || {},
        timestamp: new Date()
      });

    } catch (error) {
      this.sendError(`Session creation error: ${error}`);
      this.send({
        type: 'session_status',
        status: 'failed',
        session_id: message.session_id,
        error: String(error),
        timestamp: new Date().toISOString()
      });
    }
  }

  // Debug and monitoring methods
  getDebugInfo(): any {
    return {
      sessionId: this.sessionId,
      isClosing: this.isClosing,
      readyState: this.ws.readyState,
      readyStateText: this.getReadyStateText(),
      metrics: this.metrics,
      queueLength: this.messageQueue.length,
      processingMessage: this.processingMessage,
      uptime: this.getConnectionUptime(),
      lastActivityAge: this.getLastActivityAge(),
      remoteAddress: this.getRemoteAddress(),
      userAgent: this.getUserAgent()
    };
  }

  private getReadyStateText(): string {
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }
}
