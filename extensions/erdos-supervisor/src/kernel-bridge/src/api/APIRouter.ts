/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * HTTP API Router for the Erdos Kernel Bridge
 * Provides REST API endpoints for session management and kernel control
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { SessionManager } from '../session/SessionManager';
import { JupyterKernelSpec, RuntimeMetadata } from '../types';

export interface APIErrorResponse {
  error: string;
  message: string;
  timestamp: string;
  details?: any;
}

export interface SessionCreateRequest {
  runtime_metadata: RuntimeMetadata;
  kernel_spec: JupyterKernelSpec;
  working_directory?: string;
  explicit_session_id?: string;
}

export interface SessionResponse {
  session_id: string;
  runtime_id: string;
  state: 'starting' | 'idle' | 'busy' | 'dead';
  process_id?: number | undefined;
  connection_info?: any;
  working_directory: string;
  kernel_spec?: JupyterKernelSpec;
  created_at?: string | undefined;
  last_activity?: string | undefined;
  status?: string;
}

export interface SessionListResponse {
  sessions: Omit<SessionResponse, 'connection_info' | 'kernel_spec'>[];
  total_count: number;
  active_count: number;
}

export interface ServerStatusResponse {
  sessions: number;
  active: number;
  busy: boolean;
  idle_seconds: number;
  busy_seconds: number;
  version: string;
  process_id: number;
}

export interface ClientHeartbeatRequest {
  processId: number;
}

export interface ServerConfigurationRequest {
  idleShutdownHours?: number;
}

export interface ConnectionInfoResponse {
  shell_port: number;
  iopub_port: number;
  control_port: number;
  stdin_port: number;
  hb_port: number;
  transport: string;
  ip: string;
  signature_scheme: string;
  // Note: key is not exposed for security
}

export class APIRouter {
  private router: Router;

  constructor(private sessionManager: SessionManager) {
    this.router = Router();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Request validation middleware
    this.router.use((req: Request, res: Response, next: NextFunction) => {
      // Add request ID for tracking
      req.headers['x-request-id'] = req.headers['x-request-id'] || uuid();
      
      // Set response headers
      res.setHeader('X-API-Version', '1.0.0');
      res.setHeader('X-Server-Name', 'Erdos Kernel Bridge');
      
      next();
    });

    // JSON parsing error handler
    this.router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      if (err instanceof SyntaxError && 'body' in err) {
        this.sendError(res, 400, 'Invalid JSON', 'Request body contains invalid JSON syntax');
        return;
      }
      next(err);
    });
  }

  private setupRoutes(): void {
    // KernelBridge-compatible endpoints
    this.router.get('/status', this.getServerStatus.bind(this));
    this.router.post('/client_heartbeat', this.clientHeartbeat.bind(this));
    this.router.put('/server_configuration', this.setServerConfiguration.bind(this));
    this.router.post('/shutdown', this.shutdownServer.bind(this));

    // Session endpoints
    this.router.post('/sessions', this.createSession.bind(this));
    this.router.put('/sessions', this.createSession.bind(this));
    this.router.get('/sessions', this.getAllSessions.bind(this));
    this.router.get('/sessions/:sessionId', this.getSession.bind(this));
    this.router.delete('/sessions/:sessionId', this.deleteSession.bind(this));
    this.router.post('/sessions/:sessionId/restart', this.restartSession.bind(this));
    this.router.post('/sessions/:sessionId/interrupt', this.interruptSession.bind(this));
    this.router.post('/sessions/:sessionId/kill', this.killSession.bind(this));
    this.router.post('/sessions/:sessionId/start', this.startSession.bind(this));
    this.router.put('/sessions/:sessionId/adopt', this.adoptSession.bind(this));
    this.router.get('/sessions/:sessionId/channels', this.getChannels.bind(this));
    this.router.get('/sessions/:sessionId/connection_info', this.getConnectionInfo.bind(this));
  }

  private async getServerStatus(_req: Request, res: Response): Promise<void> {
    try {
      const sessionStats = this.sessionManager.getSessionStats();
      const allSessions = this.sessionManager.getAllSessions();
      
      const activeSessions = allSessions.filter(s => s.state !== 'dead').length;
      const busySessions = allSessions.filter(s => s.state === 'busy').length;
      
      const status: ServerStatusResponse = {
        sessions: allSessions.length,
        active: activeSessions,
        busy: busySessions > 0,
        idle_seconds: sessionStats.averageIdleTime || 0,
        busy_seconds: sessionStats.averageBusyTime || 0,
        version: '0.1.51', // Match package.json kernelBridge version
        process_id: process.pid
      };

      res.json(status);
    } catch (error) {
      this.sendError(res, 500, 'Server Status Error', 'Failed to retrieve server status', error);
    }
  }

  private async clientHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { processId }: ClientHeartbeatRequest = req.body;
      
      if (!processId || typeof processId !== 'number') {
        this.sendError(res, 400, 'Invalid Request', 'processId is required and must be a number');
        return;
      }

      // Log the heartbeat (kernelBridge doesn't require any specific response)
      console.log(`Client heartbeat received from process ${processId}`);
      
      res.json({}); // Empty response like kernelBridge
    } catch (error) {
      this.sendError(res, 500, 'Heartbeat Error', 'Failed to process client heartbeat', error);
    }
  }

  private async setServerConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const config: ServerConfigurationRequest = req.body;
      
      // Log configuration update (we don't currently implement idle shutdown)
      if (config.idleShutdownHours !== undefined) {
        console.log(`Server idle shutdown configured to ${config.idleShutdownHours} hours`);
      }
      
      res.json({}); // Empty response like kernelBridge
    } catch (error) {
      this.sendError(res, 500, 'Configuration Error', 'Failed to update server configuration', error);
    }
  }

  private async shutdownServer(_req: Request, res: Response): Promise<void> {
    try {
      // Send response before shutting down
      res.json({ message: 'Server shutdown initiated' });
      
      // Shutdown after a brief delay to allow response to be sent
      setTimeout(async () => {
        console.log('Server shutdown requested via API');
        process.exit(0);
      }, 100);
    } catch (error) {
      this.sendError(res, 500, 'Shutdown Error', 'Failed to shutdown server', error);
    }
  }

  private async createSession(req: Request, res: Response): Promise<void> {
    try {
      // Check if this is a kernelBridge-style request or kernel-bridge request
      const isKernelBridgeRequest = this.isKernelBridgeSessionRequest(req.body);
      
      let runtime_metadata: RuntimeMetadata;
      let kernel_spec: JupyterKernelSpec;
      let working_directory: string | undefined;
      let explicit_session_id: string | undefined;

      if (isKernelBridgeRequest) {
        // Convert kernelBridge format to internal format
        const kernelBridgeRequest = this.convertKernelBridgeRequest(req.body);
        runtime_metadata = kernelBridgeRequest.runtime_metadata;
        kernel_spec = kernelBridgeRequest.kernel_spec;
        working_directory = kernelBridgeRequest.working_directory;
        explicit_session_id = kernelBridgeRequest.explicit_session_id;
      } else {
        // Validate kernel-bridge request body
        const validationError = this.validateSessionCreateRequest(req.body);
        if (validationError) {
          this.sendError(res, 400, 'Validation Error', validationError);
          return;
        }

        const sessionRequest: SessionCreateRequest = req.body;
        runtime_metadata = sessionRequest.runtime_metadata;
        kernel_spec = sessionRequest.kernel_spec;
        working_directory = sessionRequest.working_directory;
        explicit_session_id = sessionRequest.explicit_session_id;
      }

      // Additional kernel spec validation
      if (!this.isValidKernelSpec(kernel_spec)) {
        this.sendError(res, 400, 'Invalid Kernel Spec', 'Kernel specification is missing required fields or has invalid values');
        return;
      }

      // Check if explicit session ID is already in use
      if (explicit_session_id && this.sessionManager.getSession(explicit_session_id)) {
        this.sendError(res, 409, 'Session Exists', `Session with ID ${explicit_session_id} already exists`);
        return;
      }

      // Create session
      const session = await this.sessionManager.createSession(
        runtime_metadata,
        kernel_spec,
        working_directory || process.cwd(),
        explicit_session_id
      );

      // Build response
      const response: SessionResponse = {
        session_id: session.sessionId,
        runtime_id: session.runtimeId,
        state: session.state,
        process_id: session.processId,
        connection_info: {
          shell_port: session.connectionInfo.shell_port,
          iopub_port: session.connectionInfo.iopub_port,
          control_port: session.connectionInfo.control_port,
          stdin_port: session.connectionInfo.stdin_port,
          hb_port: session.connectionInfo.hb_port,
          transport: session.connectionInfo.transport,
          ip: session.connectionInfo.ip,
          signature_scheme: session.connectionInfo.signature_scheme
          // Note: We don't expose the HMAC key for security reasons
        },
        working_directory: session.workingDirectory,
        kernel_spec: session.kernelSpec,
        created_at: new Date().toISOString(),
        status: 'ok'
      };

      res.status(201).json(response);

    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Maximum session limit')) {
          this.sendError(res, 503, 'Service Unavailable', error.message);
        } else if (error.message.includes('Port allocation') || error.message.includes('Could not find available port')) {
          this.sendError(res, 503, 'Resource Unavailable', 'Unable to allocate required ports for session');
        } else if (error.message.includes('Kernel process')) {
          this.sendError(res, 500, 'Kernel Error', 'Failed to start kernel process', error.message);
        } else {
          this.sendError(res, 500, 'Session Creation Failed', error.message, error);
        }
      } else {
        this.sendError(res, 500, 'Unknown Error', 'An unexpected error occurred during session creation');
      }
    }
  }

  private async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!this.isValidSessionId(sessionId)) {
        this.sendError(res, 400, 'Invalid Session ID', 'Session ID must be a valid UUID or Erdos session ID format');
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} does not exist`);
        return;
      }

      // Get session context for additional information
      const context = this.sessionManager.getSessionContext(sessionId);

      const response: SessionResponse = {
        session_id: session.sessionId,
        runtime_id: session.runtimeId,
        state: session.state,
        process_id: session.processId,
        working_directory: session.workingDirectory,
        kernel_spec: session.kernelSpec,
        created_at: context?.createdAt.toISOString(),
        last_activity: context?.lastActivity.toISOString(),
        status: 'ok'
      };

      res.json(response);

    } catch (error) {
      this.sendError(res, 500, 'Session Retrieval Error', 'Failed to retrieve session information', error);
    }
  }

  private async getAllSessions(_req: Request, res: Response): Promise<void> {
    try {
      const sessions = this.sessionManager.getAllSessions();
      const activeSessions = sessions.filter(s => s.state !== 'dead');

      const sessionList = sessions.map(session => {
        const context = this.sessionManager.getSessionContext(session.sessionId);
        return {
          session_id: session.sessionId,
          runtime_id: session.runtimeId,
          state: session.state,
          process_id: session.processId,
          working_directory: session.workingDirectory,
          created_at: context?.createdAt.toISOString(),
          last_activity: context?.lastActivity.toISOString()
        };
      });

      const response: SessionListResponse = {
        sessions: sessionList,
        total_count: sessions.length,
        active_count: activeSessions.length
      };

      res.json(response);

    } catch (error) {
      this.sendError(res, 500, 'Session List Error', 'Failed to retrieve session list', error);
    }
  }

  private async restartSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!this.isValidSessionId(sessionId)) {
        this.sendError(res, 400, 'Invalid Session ID', 'Session ID must be a valid UUID or Erdos session ID format');
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} does not exist`);
        return;
      }

      // Shutdown with restart flag
      await this.sessionManager.shutdownSession(sessionId, true);

      res.json({
        status: 'ok',
        message: 'Session restart initiated',
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.sendError(res, 500, 'Session Restart Error', 'Failed to restart session', error);
    }
  }

  private async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!this.isValidSessionId(sessionId)) {
        this.sendError(res, 400, 'Invalid Session ID', 'Session ID must be a valid UUID or Erdos session ID format');
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} does not exist`);
        return;
      }

      // Shutdown without restart
      await this.sessionManager.shutdownSession(sessionId, false);

      res.json({
        status: 'ok',
        message: 'Session terminated successfully',
        sessionId
      });

    } catch (error) {
      this.sendError(res, 500, 'Session Termination Error', 'Failed to terminate session', error);
    }
  }

  private async interruptSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!this.isValidSessionId(sessionId)) {
        this.sendError(res, 400, 'Invalid Session ID', 'Session ID must be a valid UUID or Erdos session ID format');
        return;
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} does not exist`);
        return;
      }



      if (session.state === 'dead') {
        this.sendError(res, 400, 'Session Dead', 'Cannot interrupt a dead session');
        return;
      }

      // Create interrupt message
      const interruptMessage = {
        zmq_identities: [],
        header: {
          msg_id: uuid(),
          username: 'api',
          session: sessionId,
          date: new Date().toISOString(),
          msg_type: 'interrupt_request',
          version: '5.3'
        },
        parent_header: {},
        metadata: {},
        content: {}
      };

      // Send interrupt request to kernel via control channel
      await this.sessionManager.sendMessageToKernel(sessionId, 'control', interruptMessage as any, 5000);

      res.json({
        status: 'ok',
        message: 'Interrupt signal sent to kernel',
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        this.sendError(res, 408, 'Interrupt Timeout', 'Kernel did not respond to interrupt request within timeout period');
      } else {
        this.sendError(res, 500, 'Interrupt Error', 'Failed to send interrupt signal to kernel', error);
      }
    }
  }

  private async killSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} not found`);
        return;
      }

      // Force kill the session (more aggressive than delete)
      await this.sessionManager.shutdownSession(sessionId, false);
      
      res.json({ 
        status: 'ok',
        message: 'Session killed successfully',
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.sendError(res, 500, 'Kill Session Error', 'Failed to kill session', error);
    }
  }

  private async startSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} not found`);
        return;
      }

      // For kernelBridge compatibility - sessions are started when created
      if (session.state === 'starting' || session.state === 'idle') {
        // Get kernel info from the session and return it
        // Erdos expects the actual kernel_info_reply message structure
        try {
          const kernelInfo = await this.sessionManager.getKernelInfo(sessionId);
          if (kernelInfo) {
            // Return the kernel_info_reply with status: 'ok'
            res.json({
              ...kernelInfo,
              status: 'ok'
            });
          } else {
            // Fallback if kernel info not available yet
            res.json({ 
              status: 'ok',
              message: 'Session is started but kernel info not available yet',
              session_id: sessionId
            });
          }
        } catch (kernelInfoError) {
          // If we can't get kernel info, return simple success
          res.json({ 
            status: 'ok',
            message: 'Session is already started or starting',
            session_id: sessionId
          });
        }
      } else {
        this.sendError(res, 400, 'Invalid State', 'Session cannot be started in current state');
      }
    } catch (error) {
      this.sendError(res, 500, 'Start Session Error', 'Failed to start session', error);
    }
  }

  private async adoptSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      
      // For now, just return success - we don't implement session adoption
      // Note: req.body would contain connection info for full implementation
      res.json({ 
        status: 'ok',
        message: 'Session adoption not implemented yet', 
        session_id: sessionId 
      });
    } catch (error) {
      this.sendError(res, 500, 'Adopt Session Error', 'Failed to adopt session', error);
    }
  }



  private async getConnectionInfo(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} not found`);
        return;
      }

      const connectionInfo: ConnectionInfoResponse = {
        shell_port: session.connectionInfo.shell_port,
        iopub_port: session.connectionInfo.iopub_port,
        control_port: session.connectionInfo.control_port,
        stdin_port: session.connectionInfo.stdin_port,
        hb_port: session.connectionInfo.hb_port,
        transport: session.connectionInfo.transport,
        ip: session.connectionInfo.ip,
        signature_scheme: session.connectionInfo.signature_scheme
        // Note: key is not exposed for security reasons
      };

      res.json(connectionInfo);
    } catch (error) {
      this.sendError(res, 500, 'Connection Info Error', 'Failed to get connection info', error);
    }
  }

  // Validation methods
  private validateSessionCreateRequest(body: any): string | null {
    if (!body) {
      return 'Request body is required';
    }

    if (!body.runtime_metadata) {
      return 'runtime_metadata is required';
    }

    if (!body.kernel_spec) {
      return 'kernel_spec is required';
    }

    // Validate runtime_metadata
    const { runtime_metadata } = body;
    if (!runtime_metadata.runtimeId || typeof runtime_metadata.runtimeId !== 'string') {
      return 'runtime_metadata.runtimeId is required and must be a string';
    }
    if (!runtime_metadata.runtimeName || typeof runtime_metadata.runtimeName !== 'string') {
      return 'runtime_metadata.runtimeName is required and must be a string';
    }
    if (!runtime_metadata.languageName || typeof runtime_metadata.languageName !== 'string') {
      return 'runtime_metadata.languageName is required and must be a string';
    }
    if (!runtime_metadata.languageVersion || typeof runtime_metadata.languageVersion !== 'string') {
      return 'runtime_metadata.languageVersion is required and must be a string';
    }
    if (!runtime_metadata.runtimePath || typeof runtime_metadata.runtimePath !== 'string') {
      return 'runtime_metadata.runtimePath is required and must be a string';
    }

    // Validate kernel_spec
    const { kernel_spec } = body;
    if (!kernel_spec.argv || !Array.isArray(kernel_spec.argv) || kernel_spec.argv.length === 0) {
      return 'kernel_spec.argv is required and must be a non-empty array';
    }
    if (!kernel_spec.display_name || typeof kernel_spec.display_name !== 'string') {
      return 'kernel_spec.display_name is required and must be a string';
    }
    if (!kernel_spec.language || typeof kernel_spec.language !== 'string') {
      return 'kernel_spec.language is required and must be a string';
    }
    if (!kernel_spec.kernel_protocol_version || typeof kernel_spec.kernel_protocol_version !== 'string') {
      return 'kernel_spec.kernel_protocol_version is required and must be a string';
    }

    // Validate optional fields
    if (body.working_directory && typeof body.working_directory !== 'string') {
      return 'working_directory must be a string if provided';
    }

    if (body.explicit_session_id) {
      if (typeof body.explicit_session_id !== 'string') {
        return 'explicit_session_id must be a string if provided';
      }
      if (!this.isValidSessionId(body.explicit_session_id)) {
        return 'explicit_session_id must be a valid UUID or Erdos session ID format if provided';
      }
    }

    return null;
  }

  private isValidKernelSpec(kernelSpec: any): boolean {
    // Additional validation beyond basic structure
    if (!kernelSpec || typeof kernelSpec !== 'object') {
      return false;
    }

    // Check argv contains executable path
    if (!kernelSpec.argv[0] || typeof kernelSpec.argv[0] !== 'string') {
      return false;
    }

    // Check language is supported
    const supportedLanguages = ['python', 'r'];
    if (!supportedLanguages.includes(kernelSpec.language.toLowerCase())) {
      return false;
    }

    // Check protocol version is valid
    const validProtocolVersions = ['5.0', '5.1', '5.2', '5.3', '5.4', '5.5'];
    if (!validProtocolVersions.includes(kernelSpec.kernel_protocol_version)) {
      return false;
    }

    return true;
  }

  private isValidSessionId(sessionId: string): boolean {
    // ERDOS COMPATIBILITY: Accept both UUID and Erdos session ID formats
    // UUID v4 regex for backward compatibility
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // Erdos session ID format: language-identifier (e.g., "r-4fcc1592", "python-045e1890")
    const erdosRegex = /^[a-zA-Z]+-[a-zA-Z0-9]+$/;
    
    return uuidRegex.test(sessionId) || erdosRegex.test(sessionId);
  }

  private sendError(
    res: Response, 
    statusCode: number, 
    error: string, 
    message: string, 
    details?: any
  ): void {
    const errorResponse: APIErrorResponse = {
      error,
      message,
      timestamp: new Date().toISOString()
    };

    if (details && process.env.NODE_ENV === 'development') {
      errorResponse.details = details instanceof Error ? {
        name: details.name,
        message: details.message,
        stack: details.stack
      } : details;
    }

    res.status(statusCode).json(errorResponse);
  }

  getRouter(): Router {
    return this.router;
  }

  // KernelBridge compatibility methods
  private isKernelBridgeSessionRequest(body: any): boolean {
    // KernelBridge requests have session_id, display_name, language, username, etc.
    // Kernel-bridge requests have runtime_metadata, kernel_spec
    return body && (
      body.session_id !== undefined ||
      body.display_name !== undefined ||
      body.language !== undefined ||
      body.username !== undefined ||
      body.argv !== undefined
    ) && !body.runtime_metadata && !body.kernel_spec;
  }

  private convertKernelBridgeRequest(kernelBridgeBody: any): SessionCreateRequest {
    // Extract fields from kernelBridge NewSession format
    const {
      session_id,
      display_name,
      language,
      username,
      input_prompt,
      continuation_prompt,
      argv,
      working_directory,
      env,
      connection_timeout,
      interrupt_mode,
      protocol_version,
      run_in_shell
    } = kernelBridgeBody;

    // Convert to kernel-bridge format
    return {
      runtime_metadata: {
        runtimeId: language || 'python',
        runtimeName: display_name || `${language} kernel`,
        languageName: language || 'python',
        languageVersion: '1.0.0',
        runtimePath: argv?.[0] || 'python',
        extraRuntimeData: {
          username: username || 'user',
          input_prompt: input_prompt || '>>> ',
          continuation_prompt: continuation_prompt || '... ',
          protocol_version: protocol_version || '5.3',
          connection_timeout: connection_timeout || 30,
          run_in_shell: run_in_shell || false
        }
      },
      kernel_spec: {
        argv: argv || this.getDefaultArgv(language || 'python'),
        display_name: display_name || `${language} kernel`,
        language: language || 'python',
        interrupt_mode: interrupt_mode || 'signal',
        env: this.convertKernelBridgeEnv(env || []),
        kernel_protocol_version: protocol_version || '5.3'
      },
      working_directory: working_directory || process.cwd(),
      explicit_session_id: session_id
    };
  }

  private getDefaultArgv(language: string): string[] {
    switch (language.toLowerCase()) {
      case 'python':
        return ['python', '-m', 'ipykernel_launcher', '-f', '{connection_file}'];
      case 'r':
      case 'ark':
        return ['ark', '--kernel', '--connection-file', '{connection_file}'];
      default:
        return ['python', '-m', 'ipykernel_launcher', '-f', '{connection_file}'];
    }
  }

  private convertKernelBridgeEnv(kernelBridgeEnv: any[]): { [key: string]: string } {
    const env: { [key: string]: string } = {};
    
    for (const varAction of kernelBridgeEnv) {
      if (varAction.type === 'set' && varAction.name && varAction.value !== undefined) {
        env[varAction.name] = varAction.value;
      }
    }
    
    return env;
  }

  private async getChannels(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const session = this.sessionManager.getSession(sessionId);
      
      if (!session) {
        this.sendError(res, 404, 'Session Not Found', `Session ${sessionId} not found`);
        return;
      }

      // For KernelBridge compatibility, return the WebSocket path for this session
      // This endpoint is used by Erdos to discover the WebSocket upgrade URL
      const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'wss' : 'ws');
      const host = req.headers.host;
      const websocketUrl = `${protocol}://${host}/sessions/${sessionId}/channels`;
      
      // Return the WebSocket URL as plain text (like KernelBridge does)
      res.type('text/plain');
      res.send(websocketUrl);
    } catch (error) {
      this.sendError(res, 500, 'Channels Error', 'Failed to get session channels', error);
    }
  }

  // Utility method for getting all endpoints (useful for debugging/documentation)
  getEndpoints(): Array<{ method: string; path: string; description: string }> {
    return [
      { method: 'GET', path: '/status', description: 'Get server status (kernelBridge compatible)' },
      { method: 'POST', path: '/client_heartbeat', description: 'Client heartbeat (kernelBridge compatible)' },
      { method: 'POST', path: '/sessions', description: 'Create a new kernel session (supports both formats)' },
      { method: 'GET', path: '/sessions/:sessionId', description: 'Get detailed information about a specific session' },
      { method: 'GET', path: '/sessions', description: 'List all sessions with summary information' },
      { method: 'POST', path: '/sessions/:sessionId/restart', description: 'Restart a kernel session' },
      { method: 'DELETE', path: '/sessions/:sessionId', description: 'Terminate a kernel session' },
      { method: 'POST', path: '/sessions/:sessionId/interrupt', description: 'Send interrupt signal to kernel' },
      { method: 'POST', path: '/sessions/:sessionId/kill', description: 'Kill a kernel session' },
      { method: 'PUT', path: '/sessions/:sessionId/adopt', description: 'Adopt existing session' },
      { method: 'GET', path: '/sessions/:sessionId/channels', description: 'Get WebSocket channels URL for session' },
      { method: 'GET', path: '/sessions/:sessionId/connection_info', description: 'Get connection info' },
      { method: 'PUT', path: '/server_configuration', description: 'Update server configuration' },
      { method: 'POST', path: '/shutdown', description: 'Shutdown server' }
    ];
  }
}
