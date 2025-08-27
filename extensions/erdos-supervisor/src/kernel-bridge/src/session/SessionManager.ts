/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Session Manager for the Erdos Kernel Bridge
 * Manages session lifecycle for Python IPyKernel and Ark R kernel sessions
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';
import * as net from 'net';
import { KernelSession, JupyterKernelSpec, RuntimeMetadata, ConnectionInfo, JupyterMessage } from '../types';
import { KernelProcessManager, KernelProcessInfo } from '../kernel/ProcessManager';
import { ZMQSocketManager } from '../zmq/SocketManager';
import { MessageConverter, KernelType } from '../protocol/MessageConverter';

// Forward declaration for WebSocketHandler (will be implemented in Week 5)
export interface WebSocketHandler extends EventEmitter {
  send(message: any): void;
  sendJupyterMessage?(channel: string, message: JupyterMessage): boolean;
  close(): void;
  sessionId: string;
}

export interface SessionContext {
  session: KernelSession;
  zmqManager: ZMQSocketManager;
  webSocketClients: Set<WebSocketHandler>;
  pendingRequests: Map<string, PendingRequest>;
  processInfo?: KernelProcessInfo;
  lastActivity: Date;
  createdAt: Date;
  kernelReady: boolean;
  kernelType: KernelType;
  kernelInfo?: any; // Store kernel_info_reply content
}

export interface PendingRequest {
  requestId: string;
  messageId: string;
  channel: string;
  timestamp: Date;
  timeout?: NodeJS.Timeout;
  resolve: (response: any) => void;
  reject: (error: Error) => void;
}

export interface SessionManagerOptions {
  maxSessions?: number;
  sessionTimeout?: number; // Session idle timeout in milliseconds
  requestTimeout?: number; // Individual request timeout in milliseconds
  heartbeatInterval?: number; // Heartbeat check interval
  portRange?: { min: number; max: number }; // Port allocation range
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionContext> = new Map();
  private processManager: KernelProcessManager;
  private options: Required<SessionManagerOptions>;
  private sessionTimeoutInterval: NodeJS.Timeout | null = null;
  private portAllocationLock = new Set<number>(); // Prevent port conflicts

  constructor(options?: SessionManagerOptions) {
    super();
    
    this.options = {
      maxSessions: 50,
      sessionTimeout: 3600000, // 1 hour
      requestTimeout: 30000, // 30 seconds
      heartbeatInterval: 30000, // 30 seconds
      portRange: { min: 49152, max: 65535 }, // Ephemeral port range
      ...options
    };

    this.processManager = new KernelProcessManager();
    this.setupProcessManagerEvents();
    this.startSessionMonitoring();
  }

  async createSession(
    runtimeMetadata: RuntimeMetadata,
    kernelSpec: JupyterKernelSpec,
    workingDirectory?: string,
    explicitSessionId?: string
  ): Promise<KernelSession> {
    // Check session limits
    if (this.sessions.size >= this.options.maxSessions) {
      throw new Error(`Maximum session limit reached (${this.options.maxSessions})`);
    }

    const sessionId = explicitSessionId || uuid();
    const now = new Date();
    
    // Determine kernel type
    const kernelType: KernelType = this.detectKernelType(kernelSpec);
    
    this.emit('session_creating', { 
      sessionId, 
      runtimeId: runtimeMetadata.runtimeId,
      kernelLanguage: kernelSpec.language,
      kernelType
    });

    try {
      // Generate connection information
      const connectionInfo = await this.generateConnectionInfo();
      
      // Create session object
      const session: KernelSession = {
        sessionId,
        runtimeId: runtimeMetadata.runtimeId,
        kernelSpec,
        connectionInfo,
        state: 'starting',
        workingDirectory: workingDirectory || process.cwd(),
        environmentVariables: this.prepareSessionEnvironment(kernelSpec.env || {})
      };

      // Start kernel process
      const processInfo = await this.processManager.startKernel(session, {
        timeout: kernelSpec.language?.toLowerCase() === 'r' ? 45000 : 30000, // Ark needs more time
        retries: 2
      });
      
      session.processId = processInfo.pid;
      session.state = 'idle';

      // Create ZMQ socket manager
      const zmqManager = new ZMQSocketManager(sessionId, connectionInfo);
      
      // Wait for ZMQ sockets to be ready
      await this.waitForZMQReady(zmqManager, kernelSpec.language?.toLowerCase() === 'r' ? 5000 : 3000);

      // Create session context
      const context: SessionContext = {
        session,
        zmqManager,
        webSocketClients: new Set(),
        pendingRequests: new Map(),
        processInfo,
        lastActivity: now,
        createdAt: now,
        kernelReady: false,
        kernelType
      };

      // Store session context first so initializeKernelConnection can find it
      this.sessions.set(sessionId, context);
      
      // Setup message routing
      this.setupMessageRouting(context);
      
      // Setup session monitoring
      this.setupSessionMonitoring(context);

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      // Check if kernel process is still alive
      if (!processInfo.process.pid || processInfo.process.killed) {
        throw new Error('Kernel process died during startup');
      }
      
      // Initialize kernel connection
      await this.initializeKernelConnection(context);
      
      this.emit('session_created', { 
        session, 
        processInfo: {
          pid: processInfo.pid,
          kernelType: processInfo.kernelType,
          startTime: processInfo.startTime
        }
      });

      return session;
    } catch (error) {
      this.emit('session_creation_failed', { 
        sessionId, 
        runtimeId: runtimeMetadata.runtimeId,
        error 
      });
      
      // Cleanup on failure
      await this.cleanupFailedSession(sessionId);
      throw error;
    }
  }

  async restoreSession(sessionId: string): Promise<KernelSession | null> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      this.emit('session_restore_failed', { sessionId, reason: 'session_not_found' });
      return null;
    }

    try {
      // Check if process is still alive
      if (context.session.processId && this.processManager.isProcessAlive(context.session.processId)) {
        // Recreate ZMQ manager if needed
        if (!context.zmqManager.isReady()) {
          context.zmqManager = new ZMQSocketManager(sessionId, context.session.connectionInfo);
          await this.waitForZMQReady(context.zmqManager, 3000);
          this.setupMessageRouting(context);
        }

        // Update session state
        context.session.state = 'idle';
        context.lastActivity = new Date();
        context.kernelReady = true;

        this.emit('session_restored', { sessionId, pid: context.session.processId });
        return context.session;
      } else {
        // Process is dead, remove session
        await this.shutdownSession(sessionId, false);
        this.emit('session_restore_failed', { sessionId, reason: 'process_dead' });
        return null;
      }
    } catch (error) {
      this.emit('session_restore_error', { sessionId, error });
      return null;
    }
  }

  getSession(sessionId: string): KernelSession | undefined {
    const context = this.sessions.get(sessionId);
    if (context) {
      // Update last activity
      context.lastActivity = new Date();
      return context.session;
    }
    return undefined;
  }

  getSessionContext(sessionId: string): SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): KernelSession[] {
    return Array.from(this.sessions.values()).map(ctx => ctx.session);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSessionsByRuntime(runtimeId: string): KernelSession[] {
    return Array.from(this.sessions.values())
      .filter(ctx => ctx.session.runtimeId === runtimeId)
      .map(ctx => ctx.session);
  }

  getSessionsByLanguage(language: string): KernelSession[] {
    return Array.from(this.sessions.values())
      .filter(ctx => ctx.session.kernelSpec.language?.toLowerCase() === language.toLowerCase())
      .map(ctx => ctx.session);
  }

  async shutdownSession(sessionId: string, restart: boolean = false): Promise<void> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      this.emit('session_shutdown_warning', { sessionId, reason: 'session_not_found' });
      return;
    }

    this.emit('session_shutting_down', { sessionId, restart, pid: context.session.processId });

    if (restart) {
      // SIMPLIFIED RESTART: Keep session alive, just refresh kernel process and connections
      try {

        
        // Update session state to show restart in progress  
        context.session.state = 'starting';

        // Notify WebSocket clients that restart is starting
        this.broadcastStatusToWebSocketClients(sessionId, 'restarting', 'Session restart initiated');


        // Cancel pending requests
        this.cancelPendingRequests(context, 'Session restarting');

        // Send shutdown message to current kernel
        if (context.zmqManager && context.zmqManager.isReady()) {
          try {
            const shutdownMessage = this.createJupyterMessage('shutdown_request', { restart: true }, undefined, sessionId);
            await context.zmqManager.sendMessage('control', shutdownMessage);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for graceful shutdown
          } catch (error) {
            this.emit('session_shutdown_zmq_error', { sessionId, error });
          }
        }

        // Stop the old kernel process
        if (context.session.processId) {
          try {
            await this.processManager.killKernel(context.session.processId, { timeout: 5000 });
          } catch (error) {
            this.emit('session_process_kill_error', { sessionId, error });
          }
        }

        // Generate new connection information for restart
        const newConnectionInfo = await this.generateConnectionInfo();
        
        // Start new kernel process (this gets new ports)
        const processInfo = await this.processManager.startKernel({
          ...context.session,
          connectionInfo: newConnectionInfo
        }, {
          timeout: context.kernelType?.toLowerCase() === 'r' ? 45000 : 30000,
          retries: 2
        });
        
        // Update session with new process info
        context.session.processId = processInfo.pid;
        context.session.connectionInfo = newConnectionInfo;

        // Notify that new kernel is starting
        this.broadcastStatusToWebSocketClients(sessionId, 'starting', 'New kernel process started');

        // Reconnect ZMQ sockets to new ports using existing method
        await context.zmqManager.updateConnectionAndReconnect(newConnectionInfo);
        
        // Re-initialize kernel connection
        context.kernelReady = false;
        await this.initializeKernelConnection(context);
        
        // Update session state to idle (ready)
        context.session.state = 'idle';

        
        // Send final ready status to indicate restart completion
        this.broadcastStatusToWebSocketClients(sessionId, 'ready', 'Session restart completed');


        this.emit('session_terminated', { 
          sessionId, 
          restart: true,
          uptime: Date.now() - context.createdAt.getTime(),
          lastActivity: context.lastActivity
        });

      } catch (error) {
        // On restart failure, mark session as dead
        console.error(`❌ [SessionManager] Restart failed for session ${sessionId}:`, error);
        context.session.state = 'dead';
        this.emit('session_shutdown_error', { sessionId, error });
        throw error;
      }

    } else {
      // NORMAL SHUTDOWN: Original destruction logic
      try {
        // Update session state
        context.session.state = 'dead';

        // Cancel pending requests
        this.cancelPendingRequests(context, 'Session shutting down');

        // Send shutdown message to kernel if ZMQ is available
        if (context.zmqManager && context.zmqManager.isReady()) {
          try {
            const shutdownMessage = this.createJupyterMessage('shutdown_request', { restart }, undefined, sessionId);
            await context.zmqManager.sendMessage('control', shutdownMessage);
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            this.emit('session_shutdown_zmq_error', { sessionId, error });
          }
        }

        // Close WebSocket clients
        context.webSocketClients.forEach(ws => {
          try {
            ws.close();
          } catch (error) {
            this.emit('session_websocket_close_error', { sessionId, error });
          }
        });
        context.webSocketClients.clear();

        // Close ZMQ manager
        if (context.zmqManager) {
          try {
            await context.zmqManager.close();
          } catch (error) {
            this.emit('session_zmq_close_error', { sessionId, error });
          }
        }

        // Kill kernel process
        if (context.session.processId) {
          try {
            await this.processManager.killKernel(context.session.processId, { timeout: 5000 });
          } catch (error) {
            this.emit('session_process_kill_error', { sessionId, error });
          }
        }

        // Remove from sessions map
        this.sessions.delete(sessionId);

        this.emit('session_terminated', { 
          sessionId, 
          restart,
          uptime: Date.now() - context.createdAt.getTime(),
          lastActivity: context.lastActivity
        });

      } catch (error) {
        this.emit('session_shutdown_error', { sessionId, error });
        throw error;
      }
    }
  }

  addWebSocketClient(sessionId: string, client: WebSocketHandler): boolean {
    const context = this.sessions.get(sessionId);
    if (context) {
      context.webSocketClients.add(client);
      context.lastActivity = new Date();
      
      // Set up event listeners for this WebSocket client
      this.setupWebSocketClientEvents(client, context);
      
      this.emit('websocket_client_added', { 
        sessionId, 
        clientCount: context.webSocketClients.size 
      });
      return true;
    }
    return false;
  }

  removeWebSocketClient(sessionId: string, client: WebSocketHandler): boolean {
    const context = this.sessions.get(sessionId);
    if (context) {
      const removed = context.webSocketClients.delete(client);
      if (removed) {
        this.emit('websocket_client_removed', { 
          sessionId, 
          clientCount: context.webSocketClients.size 
        });
      }
      return removed;
    }
    return false;
  }

  /**
   * Broadcasts a status update to all WebSocket clients connected to the session
   */
  private broadcastStatusToWebSocketClients(sessionId: string, status: string, reason: string): void {
    const context = this.sessions.get(sessionId);
    

    
    if (context && context.webSocketClients.size > 0) {
      const statusMessage = {
        kind: 'kernel',
        status: {
          status,
          reason
        },
        timestamp: new Date().toISOString()
      };

      context.webSocketClients.forEach((handler) => {
        try {
          handler.send(statusMessage);
        } catch (error) {
          console.error(`Failed to send status to client:`, error);
        }
      });
    }
  }

  async sendMessageToKernel(
    sessionId: string, 
    channel: string, 
    message: JupyterMessage,
    timeoutMs?: number
  ): Promise<any> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!context.zmqManager.isReady()) {
      throw new Error(`ZMQ connection not ready for session: ${sessionId}`);
    }

    // Convert message for target kernel type
    const conversionResult = MessageConverter.convertMessageForKernel(message, {
      kernelType: context.kernelType,
      direction: 'to_kernel',
      messageType: message.header.msg_type,
      sessionId
    });

    if (!conversionResult.success) {
      throw new Error(`Message conversion failed: ${conversionResult.errors.join(', ')}`);
    }

    // Emit conversion warnings if any
    if (conversionResult.warnings.length > 0) {
      this.emit('message_conversion_warnings', {
        sessionId,
        messageType: message.header.msg_type,
        warnings: conversionResult.warnings
      });
    }

    const convertedMessage = conversionResult.message;

    return new Promise((resolve, reject) => {
      const requestId = uuid();
      const timeout = timeoutMs || this.options.requestTimeout;

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        context.pendingRequests.delete(convertedMessage.header.msg_id);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Store pending request
      const pendingRequest: PendingRequest = {
        requestId,
        messageId: convertedMessage.header.msg_id,
        channel,
        timestamp: new Date(),
        timeout: timeoutHandle,
        resolve: (response) => {
          clearTimeout(timeoutHandle);
          context.pendingRequests.delete(convertedMessage.header.msg_id);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          context.pendingRequests.delete(convertedMessage.header.msg_id);
          reject(error);
        }
      };

      context.pendingRequests.set(convertedMessage.header.msg_id, pendingRequest);

      // Send converted message
      context.zmqManager.sendMessage(channel, convertedMessage).catch(error => {
        console.error(`Failed to send message to kernel: ${error}`);
        pendingRequest.reject(error);
      });

      // Update activity
      context.lastActivity = new Date();
      context.session.state = 'busy';
    });
  }

  private async generateConnectionInfo(): Promise<ConnectionInfo> {
    const ports = await this.findAvailablePorts(5);
    
    return {
      shell_port: ports[0],
      iopub_port: ports[1], 
      control_port: ports[2],
      stdin_port: ports[3],
      hb_port: ports[4],
      transport: 'tcp',
      ip: '127.0.0.1',
      key: this.generateHMACKey(),
      signature_scheme: 'hmac-sha256'
    };
  }

  private async findAvailablePorts(count: number): Promise<number[]> {
    const ports: number[] = [];
    const maxAttempts = 100;
    
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let port: number;
      let available = false;
      
      do {
        port = Math.floor(Math.random() * (this.options.portRange.max - this.options.portRange.min + 1)) + this.options.portRange.min;
        attempts++;
        
        if (attempts > maxAttempts) {
          throw new Error(`Could not find available port after ${maxAttempts} attempts`);
        }
        
        // ATOMIC CHECK: Only test availability if port is not already locked
        if (!this.portAllocationLock.has(port)) {
          available = await this.isPortAvailable(port);
          
          // IMMEDIATELY lock the port if it's available to prevent race conditions
          if (available) {
            this.portAllocationLock.add(port);
          }
        }
      } while (!available);
      
      ports.push(port);
      
      // Auto-release port allocation lock after 45 seconds (increased from 30s)
      setTimeout(() => {
        this.portAllocationLock.delete(port);
      }, 45000);
    }
    
    return ports;
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  private generateHMACKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private prepareSessionEnvironment(kernelEnv: Record<string, string>): Record<string, string> {
    // Filter undefined values from process.env
    const filteredEnv = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== undefined) as [string, string][]
    );
    
    const env = { ...filteredEnv, ...kernelEnv };
    
    // Ensure critical environment variables
    env.PATH = env.PATH || filteredEnv.PATH || '';
    
    // Remove potentially problematic variables
    delete env.JUPYTER_RUNTIME_DIR;
    delete env.JUPYTER_DATA_DIR;
    
    return env;
  }

  private setupMessageRouting(context: SessionContext): void {
    const { zmqManager, session } = context;

    // Remove any existing listeners to prevent duplicates
    zmqManager.removeAllListeners('shell_message');
    zmqManager.removeAllListeners('iopub_message');
    zmqManager.removeAllListeners('control_message');
    zmqManager.removeAllListeners('stdin_message');
    zmqManager.removeAllListeners('message_error');
    zmqManager.removeAllListeners('heartbeat_success');
    zmqManager.removeAllListeners('heartbeat_failed');

    // Handle shell messages (execute_request, complete_request, etc.)
    zmqManager.on('shell_message', (message: JupyterMessage) => {
      this.handleKernelMessage(context, 'shell', message);
    });

    // Handle IOPub messages (status, execute_result, stream, etc.)
    zmqManager.on('iopub_message', (message: JupyterMessage) => {
      this.handleKernelMessage(context, 'iopub', message);
    });

    // Handle control messages (interrupt_request, shutdown_request, etc.)
    zmqManager.on('control_message', (message: JupyterMessage) => {
      this.handleKernelMessage(context, 'control', message);
    });

    // Handle stdin messages (input_request, input_reply)
    zmqManager.on('stdin_message', (message: JupyterMessage) => {
      this.handleKernelMessage(context, 'stdin', message);
    });

    // Handle ZMQ errors
    zmqManager.on('message_error', (error) => {
      this.emit('session_zmq_error', { sessionId: session.sessionId, error });
    });

    // Handle heartbeat events
    zmqManager.on('heartbeat_success', ({ latency }) => {
      context.lastActivity = new Date();
      this.emit('session_heartbeat', { sessionId: session.sessionId, latency });
    });

    zmqManager.on('heartbeat_failed', (error) => {
      this.emit('session_heartbeat_failed', { sessionId: session.sessionId, error });
      // Consider marking session as problematic
      context.session.state = 'dead';
    });
  }

  private setupWebSocketClientEvents(client: WebSocketHandler, context: SessionContext): void {
    // Listen for Jupyter messages from WebSocket client and forward to kernel
    client.on('jupyter_message', async (event: any) => {
      try {
        const { channel, message, sessionId } = event;
        
        // Verify this is for the correct session
        if (sessionId !== context.session.sessionId) {
          console.warn(`Received message for wrong session: expected ${context.session.sessionId}, got ${sessionId}`);
          return;
        }
        
        // Send message to kernel via ZMQ
        await this.sendMessageToKernel(sessionId, channel, message);
        
        // Emit success event
        this.emit('message_forwarded', {
          sessionId,
          channel,
          messageType: message.header.msg_type,
          messageId: message.header.msg_id
        });
        
        // Update activity timestamp
        context.lastActivity = new Date();
        
      } catch (error) {
        console.error('Error handling WebSocket jupyter_message:', error);
        this.emit('message_forward_error', {
          sessionId: context.session.sessionId,
          channel: event.channel,
          messageType: event.message?.header?.msg_type || 'unknown',
          messageId: event.message?.header?.msg_id || 'unknown',
          error
        });
      }
    });

    // Listen for WebSocket disconnection
    client.on('disconnect', () => {
      this.removeWebSocketClient(context.session.sessionId, client);
    });

    // Listen for WebSocket errors
    client.on('error', (error: Error) => {
      console.error(`WebSocket error for session ${context.session.sessionId}:`, error);
      this.emit('websocket_error', { 
        sessionId: context.session.sessionId, 
        error 
      });
    });
  }

  private handleKernelMessage(context: SessionContext, channel: string, message: JupyterMessage): void {
    const { session } = context;
    let processedMessage = message;
    
    // Convert message from kernel for client compatibility
    try {
      const conversionResult = MessageConverter.convertMessageForKernel(message, {
        kernelType: context.kernelType,
        direction: 'from_kernel',
        messageType: message.header.msg_type,
        sessionId: context.session.sessionId
      });

      if (conversionResult.success) {
        processedMessage = conversionResult.message;
        
        // Emit conversion warnings if any
        if (conversionResult.warnings.length > 0) {
          this.emit('message_conversion_warnings', {
            sessionId: context.session.sessionId,
            messageType: message.header.msg_type,
            warnings: conversionResult.warnings
          });
        }
      } else {
        this.emit('message_conversion_error', {
          sessionId: context.session.sessionId,
          messageType: message.header.msg_type,
          errors: conversionResult.errors
        });
      }
    } catch (error) {
      this.emit('message_conversion_error', {
        sessionId: context.session.sessionId,
        messageType: message.header.msg_type,
        errors: [`Conversion exception: ${error}`]
      });
    }
    
    // Update session activity
    context.lastActivity = new Date();
    
    // Update session state based on message type
    if (processedMessage.header.msg_type === 'status') {
      const executionState = (processedMessage.content as any).execution_state;
      if (executionState === 'idle') {
        session.state = 'idle';
      } else if (executionState === 'busy') {
        session.state = 'busy';
      }
    }

    // Handle kernel_info_reply to mark kernel as ready
    if (processedMessage.header.msg_type === 'kernel_info_reply') {
      context.kernelReady = true;
      this.emit('session_kernel_ready', { sessionId: session.sessionId });
    }

    // Resolve pending requests
    if (processedMessage.parent_header?.msg_id) {
      const pendingRequest = context.pendingRequests.get(processedMessage.parent_header.msg_id);
      if (pendingRequest) {
        // Check if this is a final response message
        const isFinalResponse = this.isFinalResponseMessage(processedMessage.header.msg_type);
        if (isFinalResponse) {
          pendingRequest.resolve(processedMessage);
        }
      }
    }

    // Emit session message event (KernelBridgeServer will handle WebSocket broadcast)
    this.emit('session_message', {
      sessionId: session.sessionId,
      channel,
      messageType: processedMessage.header.msg_type,
      message: processedMessage
    });
  }

  private isFinalResponseMessage(msgType: string): boolean {
    const finalResponseTypes = [
      'execute_reply',
      'complete_reply', 
      'inspect_reply',
      'is_complete_reply',
      'kernel_info_reply',
      'history_reply',
      'interrupt_reply',
      'shutdown_reply',
      'comm_close',
      'input_reply'
    ];
    return finalResponseTypes.includes(msgType);
  }

  private createJupyterMessage(
    msgType: string, 
    content: any, 
    parentHeader?: any,
    sessionId?: string
  ): JupyterMessage {
    return {
      zmq_identities: [],
      header: {
        msg_id: uuid(),
        username: 'bridge',
        session: sessionId || uuid(),
        date: new Date().toISOString(),
        msg_type: msgType,
        version: '5.3'
      },
      parent_header: parentHeader,
      metadata: {},
      content
    };
  }

  private async waitForZMQReady(zmqManager: ZMQSocketManager, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`ZMQ not ready after ${timeoutMs}ms`));
      }, timeoutMs);

      if (zmqManager.isReady()) {
        clearTimeout(timeout);
        resolve();
      } else {
        zmqManager.once('sockets_ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      }
    });
  }

  private async initializeKernelConnection(context: SessionContext): Promise<void> {
    // Send kernel_info_request to establish connection
    const kernelInfoMessage = this.createJupyterMessage(
      'kernel_info_request', 
      {}, 
      undefined, 
      context.session.sessionId
    );

    try {
      await this.sendMessageToKernel(
        context.session.sessionId, 
        'shell', 
        kernelInfoMessage,
        10000 // 10 second timeout for kernel info
      );
    } catch (error) {
      this.emit('session_init_error', { 
        sessionId: context.session.sessionId, 
        error 
      });
      throw new Error(`Failed to initialize kernel connection: ${error}`);
    }
  }

  private setupSessionMonitoring(context: SessionContext): void {
    const checkInterval = setInterval(() => {
      if (!this.sessions.has(context.session.sessionId)) {
        clearInterval(checkInterval);
        return;
      }

      // Check if session is idle for too long
      const idleTime = Date.now() - context.lastActivity.getTime();
      if (idleTime > this.options.sessionTimeout) {
        this.emit('session_idle_timeout', { 
          sessionId: context.session.sessionId, 
          idleTime 
        });
        // Optionally auto-shutdown idle sessions
        // this.shutdownSession(context.session.sessionId);
      }
    }, this.options.heartbeatInterval);
  }

  private setupProcessManagerEvents(): void {
    this.processManager.on('kernel_exit', ({ sessionId, pid, code, signal }) => {
      const context = this.sessions.get(sessionId);
      if (context) {
        context.session.state = 'dead';
        this.emit('session_process_exit', { sessionId, pid, code, signal });
      }
    });

    this.processManager.on('kernel_error', ({ sessionId, error }) => {
      this.emit('session_process_error', { sessionId, error });
    });
  }

  private startSessionMonitoring(): void {
    this.sessionTimeoutInterval = setInterval(() => {
      this.checkSessionHealth();
    }, this.options.heartbeatInterval);
  }

  private checkSessionHealth(): void {
    for (const [sessionId, context] of this.sessions.entries()) {
      // Check if process is still alive
      if (context.session.processId && !this.processManager.isProcessAlive(context.session.processId)) {
        this.emit('session_process_dead', { sessionId });
        this.shutdownSession(sessionId).catch(error => {
          this.emit('session_cleanup_error', { sessionId, error });
        });
      }
    }
  }

  private cancelPendingRequests(context: SessionContext, reason: string): void {
    const error = new Error(reason);
    context.pendingRequests.forEach(request => {
      request.reject(error);
    });
    context.pendingRequests.clear();
  }

  private async cleanupFailedSession(sessionId: string): Promise<void> {
    // Clean up any partial session state
    const context = this.sessions.get(sessionId);
    if (context) {
      this.sessions.delete(sessionId);
      
      if (context.zmqManager) {
        try {
          await context.zmqManager.close();
        } catch (error) {
          this.emit('cleanup_zmq_error', { sessionId, error });
        }
      }
      
      if (context.session.processId) {
        try {
          await this.processManager.killKernel(context.session.processId, { force: true });
        } catch (error) {
          this.emit('cleanup_process_error', { sessionId, error });
        }
      }
    }
  }

  // Cleanup and shutdown
  async shutdown(): Promise<void> {
    this.emit('session_manager_shutting_down', { 
      activeSessionCount: this.sessions.size 
    });

    // Stop monitoring
    if (this.sessionTimeoutInterval) {
      clearInterval(this.sessionTimeoutInterval);
      this.sessionTimeoutInterval = null;
    }

    // Shutdown all sessions
    const shutdownPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.shutdownSession(sessionId).catch(error => 
        this.emit('session_shutdown_error', { sessionId, error })
      )
    );

    await Promise.allSettled(shutdownPromises);

    // Cleanup process manager
    await this.processManager.cleanup();

    this.emit('session_manager_shutdown_complete');
  }

  // Utility methods
  getSessionStats(): any {
    const stats = {
      totalSessions: this.sessions.size,
      sessionsByState: {
        starting: 0,
        idle: 0,
        busy: 0,
        dead: 0
      },
      sessionsByLanguage: {} as Record<string, number>,
      averageUptime: 0,
      totalWebSocketClients: 0
    };

    let totalUptime = 0;
    const now = Date.now();

    for (const context of this.sessions.values()) {
      stats.sessionsByState[context.session.state]++;
      
      const language = context.session.kernelSpec.language || 'unknown';
      stats.sessionsByLanguage[language] = (stats.sessionsByLanguage[language] || 0) + 1;
      
      totalUptime += now - context.createdAt.getTime();
      stats.totalWebSocketClients += context.webSocketClients.size;
    }

    if (stats.totalSessions > 0) {
      stats.averageUptime = totalUptime / stats.totalSessions;
    }

    return stats;
  }

  private detectKernelType(kernelSpec: JupyterKernelSpec): KernelType {
    // Detect kernel type based on language and display name
    const language = kernelSpec.language?.toLowerCase() || '';
    const displayName = kernelSpec.display_name?.toLowerCase() || '';
    
    // Check for R/Ark kernel indicators
    if (language === 'r' || 
        displayName.includes('r ') || 
        displayName.includes('ark') ||
        kernelSpec.argv.some((arg: string) => arg.includes('ark') || arg.includes('R'))) {
      return 'ark';
    }
    
    // Check for Python kernel indicators
    if (language === 'python' || 
        displayName.includes('python') ||
        kernelSpec.argv.some((arg: string) => arg.includes('python') || arg.includes('ipykernel'))) {
      return 'python';
    }
    
    // Default to Python for unknown kernels
    return 'python';
  }

  async getKernelInfo(sessionId: string): Promise<any | null> {
    const context = this.sessions.get(sessionId);
    if (!context) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // If we already have kernel info cached, return it
    if (context.kernelInfo) {
      return context.kernelInfo;
    }

    // If kernel is not ready, return null
    if (!context.kernelReady || !context.zmqManager) {
      return null;
    }

    // Request kernel info from the kernel
    try {
      const kernelInfoRequest = {
        header: {
          msg_id: uuid(),
          msg_type: 'kernel_info_request',
          username: 'kernel-bridge',
          session: sessionId,
          version: '5.3',
          date: new Date().toISOString()
        },
        parent_header: {},
        metadata: {},
        content: {}
      };

      // Send the request and wait for response
      const response = await this.sendMessageToKernel(sessionId, 'shell', kernelInfoRequest as any, 5000);
      
      if (response && response.content) {
        // Cache the kernel info for future requests
        context.kernelInfo = response.content;
        return response.content;
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to get kernel info for session ${sessionId}:`, error);
      return null;
    }
  }
}
