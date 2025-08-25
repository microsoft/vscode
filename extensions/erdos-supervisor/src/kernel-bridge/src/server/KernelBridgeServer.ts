/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Kernel Bridge Server for the Erdos Kernel Bridge
 * Main HTTP/WebSocket server for Python and Ark kernel communication
 */

import express, { Request, Response, NextFunction } from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { URL } from 'url';
import { SessionManager } from '../session/SessionManager';
import { WebSocketHandler } from './WebSocketHandler';

import { APIRouter } from '../api/APIRouter';

// Logger interface for external logger compatibility
export interface ServerLogger {
  log(message: string, level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'): void;
  error(message: string, error?: any): void;
  warn(message: string): void;
  debug(message: string): void;
}

export interface KernelBridgeServerOptions {
  port?: number;
  host?: string;
  corsOrigins?: string[] | string;
  maxConnections?: number;
  websocketPath?: string;
  enableCompression?: boolean;
  heartbeatInterval?: number;
  clientTimeout?: number;
  requestSizeLimit?: string;
  logger?: ServerLogger;
  bearerToken?: string;
}

export interface ServerMetrics {
  startTime: Date;
  totalConnections: number;
  activeConnections: number;
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  errors: number;
  uptime: number;
}

export class KernelBridgeServer extends EventEmitter {
  private app: express.Application;
  private server: http.Server;
  private wss!: WebSocket.Server;
  private sessionManager: SessionManager;
  private apiRouter: APIRouter;
  private options: Required<Omit<KernelBridgeServerOptions, 'logger' | 'bearerToken'>>;
  private logger: ServerLogger;
  private bearerToken: string | undefined;
  private metrics: ServerMetrics;
  private isShuttingDown = false;
  private activeConnections: Set<WebSocketHandler> = new Set();

  constructor(options?: KernelBridgeServerOptions) {
    super();
    
    // Setup logger (use provided logger or default stderr logger)
    this.logger = options?.logger || {
      log: (message: string, level: string = 'INFO') => {
        const timestamp = new Date().toISOString();
        process.stderr.write(`[${timestamp}] ${level}: ${message}\n`);
      },
      error: (message: string, error?: any) => {
        const timestamp = new Date().toISOString();
        process.stderr.write(`[${timestamp}] ERROR: ${message}${error ? ': ' + error.toString() : ''}\n`);
      },
      warn: (message: string) => {
        const timestamp = new Date().toISOString();
        process.stderr.write(`[${timestamp}] WARN: ${message}\n`);
      },
      debug: (message: string) => {
        const timestamp = new Date().toISOString();
        process.stderr.write(`[${timestamp}] DEBUG: ${message}\n`);
      }
    };
    
    this.options = {
      port: 8080,
      host: '0.0.0.0',
      corsOrigins: '*',
      maxConnections: 1000,
      websocketPath: '/sessions', // Base path for WebSocket connections
      enableCompression: true,
      heartbeatInterval: 30000,
      clientTimeout: 60000,
      requestSizeLimit: '10mb',
      ...options
    };

    // Store bearer token for authentication
    this.bearerToken = options?.bearerToken;

    this.metrics = {
      startTime: new Date(),
      totalConnections: 0,
      activeConnections: 0,
      totalSessions: 0,
      activeSessions: 0,
      totalMessages: 0,
      errors: 0,
      uptime: 0
    };

    this.app = express();
    this.server = http.createServer(this.app);
    this.sessionManager = new SessionManager({
      maxSessions: 100,
      sessionTimeout: 3600000, // 1 hour
      heartbeatInterval: this.options.heartbeatInterval
    });

    this.apiRouter = new APIRouter(this.sessionManager);
    
    this.logger.log('Kernel Bridge Server initialized');
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocketServer();
    this.setupSessionManagerEvents();
    this.startMetricsUpdater();
  }

  setAPIRouter(apiRouter: APIRouter): void {
    this.apiRouter = apiRouter;
  }

  private setupMiddleware(): void {
    // Request size limit
    this.app.use(express.json({ limit: this.options.requestSizeLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: this.options.requestSizeLimit }));

    // CORS middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      const allowedOrigins = Array.isArray(this.options.corsOrigins) 
        ? this.options.corsOrigins 
        : [this.options.corsOrigins];

      if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }

      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Bearer token authentication middleware (only if token is configured)
    if (this.bearerToken) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        // Skip authentication for certain endpoints
        const publicEndpoints = ['/health', '/info'];
        if (publicEndpoints.includes(req.path)) {
          return next();
        }

        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return res.status(401).json({ error: 'Authorization header required' });
        }

        const match = authHeader.match(/^Bearer\s+(.+)$/);
        if (!match || match[1] !== this.bearerToken) {
          return res.status(401).json({ error: 'Invalid bearer token' });
        }

        next();
      });
    }

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.emit('http_request', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.headers['user-agent'],
          remoteAddress: req.ip || req.connection.remoteAddress
        });
      });

      next();
    });

    // Error handling middleware
    this.app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      this.metrics.errors++;
      
      this.logger.error(`HTTP error in ${req.method} ${req.url}`, err);
      
      this.emit('http_error', {
        error: err,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent']
      });

      if (!res.headersSent) {
        res.status(err.status || 500).json({
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.metrics.startTime.getTime(),
        metrics: {
          activeConnections: this.metrics.activeConnections,
          activeSessions: this.sessionManager.getActiveSessionCount(),
          totalMessages: this.metrics.totalMessages
        },
        memory: process.memoryUsage(),
        version: process.version
      };

      res.json(health);
    });

    // Metrics endpoint
    this.app.get('/metrics', (_req: Request, res: Response) => {
      const metrics = {
        ...this.metrics,
        uptime: Date.now() - this.metrics.startTime.getTime(),
        activeSessions: this.sessionManager.getActiveSessionCount(),
        sessionStats: this.sessionManager.getSessionStats(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      };

      res.json(metrics);
    });

    // Server info endpoint
    this.app.get('/info', (req: Request, res: Response) => {
      res.json({
        name: 'Erdos Kernel Bridge',
        version: '1.0.0',
        description: 'WebSocket bridge for Python and Ark kernel communication',
        protocols: ['jupyter', 'websocket'],
        supportedKernels: ['python', 'ark'],
        endpoints: {
          websocket: `ws://${req.headers.host}/sessions/<session_id>/channels`,
          health: `http://${req.headers.host}/health`,
          metrics: `http://${req.headers.host}/metrics`
        },
        features: ['sessions', 'kernels', 'websockets', 'heartbeat', 'compression']
      });
    });

    // Static file serving (for any future web interface)
    this.app.use('/static', express.static('public', {
      maxAge: '1d',
      etag: true
    }));

    // Setup API routes
    this.setupAPIRoutes();

    // Catch-all 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupAPIRoutes(): void {
    // Mount API router at root for kernelBridge compatibility (no /api prefix)
    this.app.use('/', this.apiRouter.getRouter());
  }

  private setupWebSocketServer(): void {
    this.wss = new WebSocket.Server({ 
      server: this.server,
      // Remove fixed path - handle dynamic paths in verifyClient
      perMessageDeflate: this.options.enableCompression ? {
        zlibDeflateOptions: {
          level: 6,
          chunkSize: 4096
        },
        threshold: 1024,
        concurrencyLimit: 10,
        serverMaxWindowBits: 15,
        clientMaxWindowBits: 15,
        serverNoContextTakeover: false,
        clientNoContextTakeover: false
      } : false,
      maxPayload: 10 * 1024 * 1024, // 10MB max payload
      verifyClient: (info: { origin: string; secure: boolean; req: http.IncomingMessage }) => {
        // Only accept WebSocket connections to /sessions/{sessionId}/channels
        const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
        const pathMatch = url.pathname.match(/^\/sessions\/([^\/]+)\/channels$/);
        return pathMatch !== null;
      }
    });

    // Handle WebSocket server events
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      this.handleWebSocketConnection(ws, req);
    });

    this.wss.on('error', (error: Error) => {
      this.emit('websocket_server_error', error);
    });

    this.wss.on('headers', (headers: string[], _req: http.IncomingMessage) => {
      // Add custom headers if needed
      headers.push('X-Kernel-Bridge-Version: 1.0.0');
    });

    this.emit('websocket_server_ready', {
      path: this.options.websocketPath,
      compression: this.options.enableCompression
    });
  }

  private handleWebSocketConnection(ws: WebSocket, req: http.IncomingMessage): void {
    try {
      this.logger.log(`WebSocket connection received: ${req.url}`, 'INFO');
      
      // Check connection limits
      if (this.activeConnections.size >= this.options.maxConnections) {
        this.logger.log('Connection rejected: too many connections', 'WARN');
        ws.close(1013, 'Server overloaded - too many connections');
        return;
      }

      // Extract session ID from path /sessions/{sessionId}/channels
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const pathMatch = url.pathname.match(/^\/sessions\/([^\/]+)\/channels$/);
      
      if (!pathMatch) {
        ws.close(1008, 'Invalid WebSocket path. Use /sessions/{sessionId}/channels');
        return;
      }
      
      const sessionId = pathMatch[1];
      this.logger.log(`Extracted session ID from path: ${sessionId}`, 'INFO');

      // Validate session ID format (accept both UUID and KernelBridge format)
      // KernelBridge uses format: r-12345678 or python-notebook-12345678
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const kernelBridgeRegex = /^(r|python)(-notebook)?-[0-9a-f]+$/i;
      
      if (!uuidRegex.test(sessionId) && !kernelBridgeRegex.test(sessionId)) {
        ws.close(1008, 'Invalid session ID format. Must be a UUID or KernelBridge format (e.g., r-abc123, python-notebook-abc123)');
        return;
      }

      // Note: Session will be created when client sends create_session message
      // We don't require the session to exist before WebSocket connection
      this.logger.log(`WebSocket connection validated for session: ${sessionId}`, 'INFO');

      // Create WebSocket handler
      this.logger.log(`Creating WebSocket handler for session: ${sessionId}`, 'INFO');
      const handler = new WebSocketHandler(ws, sessionId, {
        heartbeatInterval: this.options.heartbeatInterval,
        enableCompression: this.options.enableCompression
      });

      // Update metrics
      this.metrics.totalConnections++;
      this.metrics.activeConnections = this.activeConnections.size + 1;
      this.activeConnections.add(handler);
      this.logger.log('WebSocket handler created and added to connections', 'INFO');

      // Store the client temporarily - session will be created via create_session message
      // Don't require the session to exist yet
      this.logger.log('Storing WebSocket client for future session creation', 'INFO');

      // Setup handler events
      this.setupWebSocketHandlerEvents(handler, sessionId);

      // Check if session already exists (API-created session)
      const existingSession = this.sessionManager.getSession(sessionId);
      if (existingSession) {
        this.logger.log(`Adding WebSocket client to existing session: ${sessionId}`, 'INFO');
        const added = this.sessionManager.addWebSocketClient(sessionId, handler);
        if (added) {
          this.logger.log('WebSocket client added to existing session', 'INFO');
        } else {
          this.logger.warn('Failed to add WebSocket client to existing session');
        }
      }

      this.emit('websocket_connection', {
        sessionId,
        remoteAddress: handler.getRemoteAddress(),
        userAgent: handler.getUserAgent(),
        totalConnections: this.metrics.totalConnections,
        activeConnections: this.activeConnections.size
      });

      // Send welcome message using Erdos's expected format
      handler.send({
        kind: 'kernel',
        status: {
          status: 'ready', // Indicate kernel is ready
          reason: 'WebSocket connection established'
        },
        sessionId,
        serverInfo: {
          name: 'Erdos Kernel Bridge',
          version: '1.0.0',
          protocols: ['jupyter'],
          features: ['heartbeat', 'compression', 'kernel-types']
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.metrics.errors++;
      this.emit('websocket_connection_error', {
        error,
        url: req.url,
        remoteAddress: req.socket.remoteAddress
      });
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
      }
    }
  }

  private setupWebSocketHandlerEvents(handler: WebSocketHandler, sessionId: string): void {
    // Handle session creation from client
    handler.on('create_session', async ({ sessionId: requestedSessionId, kernelSpec, metadata }) => {
      try {
        this.logger.log(`Starting session creation for: ${requestedSessionId}`, 'INFO');
        this.logger.log(`Kernel spec: ${JSON.stringify({ argv: kernelSpec.argv, language: kernelSpec.language })}`, 'DEBUG');
        
        // Create session using SessionManager
        // First create mock runtime metadata since we're not integrated with the full runtime system yet
        const runtimeMetadata = {
          runtimeId: requestedSessionId,
          runtimeName: `${kernelSpec.language} Runtime`,
          languageName: kernelSpec.language,
          languageVersion: '3.x',
          runtimePath: kernelSpec.argv[0], // Use the first arg as the runtime path (e.g., python3)
          extraRuntimeData: metadata
        };
        
        this.logger.log(`Creating session with metadata: ${JSON.stringify(runtimeMetadata)}`, 'DEBUG');
        await this.sessionManager.createSession(runtimeMetadata, kernelSpec, metadata?.working_directory, requestedSessionId);
        this.logger.log('Session created successfully', 'INFO');
        
        // Now add the WebSocket client to the created session
        const added = this.sessionManager.addWebSocketClient(requestedSessionId, handler);
        if (!added) {
          throw new Error('Failed to add WebSocket client to created session');
        }
        
        // Send success status
        handler.send({
          type: 'session_status',
          status: 'ready',
          session_id: requestedSessionId,
          timestamp: new Date().toISOString()
        });
        
        this.emit('session_created', {
          sessionId: requestedSessionId,
          kernelSpec,
          metadata
        });
        
      } catch (error) {
        this.metrics.errors++;
        this.emit('session_creation_error', {
          sessionId: requestedSessionId,
          error
        });
        
        handler.send({
          type: 'session_status',
          status: 'failed',
          session_id: requestedSessionId,
          error: String(error),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Note: Jupyter message handling is now done by SessionManager.setupWebSocketClientEvents()
    // to avoid duplicate message forwarding to the kernel

    // Handle client disconnect
    handler.on('disconnect', () => {
      this.handleWebSocketDisconnect(handler, sessionId);
    });

    // Handle WebSocket errors
    handler.on('websocket_error', ({ error }) => {
      this.metrics.errors++;
      this.emit('websocket_handler_error', {
        sessionId,
        error
      });
    });

    // Handle kernel interrupt requests
    handler.on('kernel_interrupt_request', async ({ requestId }) => {
      try {
        // Send interrupt to kernel via session manager
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          const interruptMessage: any = {
            zmq_identities: [],
            header: {
              msg_id: require('uuid').v4(),
              username: 'client',
              session: sessionId,
              date: new Date().toISOString(),
              msg_type: 'interrupt_request',
              version: '5.3'
            },
            metadata: {},
            content: {}
          };
          
          await this.sessionManager.sendMessageToKernel(sessionId, 'control', interruptMessage);
          
          handler.send({
            type: 'kernel_interrupt_ack',
            requestId,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        handler.sendError(`Kernel interrupt failed: ${error}`);
      }
    });

    // Handle kernel restart requests
    handler.on('kernel_restart_request', async ({ requestId }) => {
      try {
        await this.sessionManager.shutdownSession(sessionId, true);
        
        handler.send({
          type: 'kernel_restart_ack',
          requestId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        handler.sendError(`Kernel restart failed: ${error}`);
      }
    });

    // Handle message metrics
    handler.on('message_received', () => {
      this.metrics.totalMessages++;
    });
  }

  private handleWebSocketDisconnect(handler: WebSocketHandler, sessionId: string): void {
    // Remove from active connections
    this.activeConnections.delete(handler);
    this.metrics.activeConnections = this.activeConnections.size;

    // Remove from session manager
    this.sessionManager.removeWebSocketClient(sessionId, handler);

    this.emit('websocket_disconnect', {
      sessionId,
      connectionUptime: handler.getConnectionUptime(),
      metrics: handler.getMetrics(),
      activeConnections: this.activeConnections.size
    });
  }

  private setupSessionManagerEvents(): void {
    // Forward session events
    this.sessionManager.on('session_created', (event) => {
      this.metrics.totalSessions++;
      this.emit('session_created', event);
    });

    this.sessionManager.on('session_terminated', (event) => {
      this.emit('session_terminated', event);
    });

    this.sessionManager.on('session_message', ({ sessionId, channel, message }) => {
  
      
      // Broadcast message to all WebSocket clients for this session
      const sessionContext = this.sessionManager.getSessionContext(sessionId);
      if (sessionContext) {
        sessionContext.webSocketClients.forEach(handler => {
          if (handler.sendJupyterMessage) {
            handler.sendJupyterMessage(channel, message);
          } else {
            // ERDOS COMPATIBILITY: Fallback using 'kind' field for Erdos format
            handler.send({
              kind: 'jupyter',
              channel,
              ...message  // Spread the Jupyter message fields directly
            });
          }
        });
      }
    });

    // Forward other session events
    const eventsToForward = [
      'session_creation_failed',
      'session_zmq_error',
      'session_heartbeat_failed',
      'session_process_error'
    ];

    eventsToForward.forEach(eventName => {
      this.sessionManager.on(eventName, (event) => {
        this.emit(eventName, event);
      });
    });
  }

  private startMetricsUpdater(): void {
    setInterval(() => {
      this.metrics.uptime = Date.now() - this.metrics.startTime.getTime();
      this.metrics.activeSessions = this.sessionManager.getActiveSessionCount();
      this.metrics.activeConnections = this.activeConnections.size;
    }, 5000); // Update every 5 seconds
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, () => {
        const address = this.server.address();
        const host = typeof address === 'string' ? address : `${address?.address}:${address?.port}`;
        
        this.emit('server_started', {
          host: this.options.host,
          port: this.options.port,
          websocketPath: this.options.websocketPath,
          maxConnections: this.options.maxConnections
        });

        this.logger.log(`Kernel Bridge Server listening on ${host}`);
        this.logger.log(`WebSocket endpoint: ws://${host}${this.options.websocketPath}?sessionId=<session_id>`);
        this.logger.log(`Health check: http://${host}/health`);
        this.logger.log(`Server started successfully with PID ${process.pid}`);
        
        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error('Server error during startup', error);
        this.emit('server_error', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.logger.log('Initiating server shutdown');
    this.isShuttingDown = true;
    
    this.emit('server_stopping', {
      activeConnections: this.activeConnections.size,
      activeSessions: this.sessionManager.getActiveSessionCount()
    });

    this.logger.log(`Shutting down ${this.activeConnections.size} active connections and ${this.sessionManager.getActiveSessionCount()} active sessions`);

    // Close all WebSocket connections
    this.activeConnections.forEach(handler => {
      handler.close(1001, 'Server shutting down');
    });

    // Close WebSocket server
    this.wss.close();

    // Shutdown all sessions
    await this.sessionManager.shutdown();

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        const uptime = Date.now() - this.metrics.startTime.getTime();
        this.logger.log(`Server stopped successfully after ${uptime}ms uptime. Total connections: ${this.metrics.totalConnections}, Total sessions: ${this.metrics.totalSessions}`);
        
        this.emit('server_stopped', {
          uptime: uptime,
          totalConnections: this.metrics.totalConnections,
          totalSessions: this.metrics.totalSessions
        });
        resolve();
      });
    });
  }

  // Utility methods
  getActiveConnectionCount(): number {
    return this.activeConnections.size;
  }

  getMetrics(): ServerMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      activeSessions: this.sessionManager.getActiveSessionCount(),
      activeConnections: this.activeConnections.size
    };
  }

  getServerInfo(): any {
    return {
      name: 'Erdos Kernel Bridge',
      version: '1.0.0',
      host: this.options.host,
      port: this.options.port,
      websocketPath: this.options.websocketPath,
      maxConnections: this.options.maxConnections,
      compression: this.options.enableCompression,
      uptime: Date.now() - this.metrics.startTime.getTime(),
      nodeVersion: process.version
    };
  }

  isRunning(): boolean {
    return this.server.listening && !this.isShuttingDown;
  }
}
