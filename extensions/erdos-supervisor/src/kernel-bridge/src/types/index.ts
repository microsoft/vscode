/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Core type definitions for the Erdos Kernel Bridge
 */

import { JupyterKernelSpec as KernelSpecType } from './kernel.js';

export interface ConnectionInfo {
  shell_port: number;
  iopub_port: number;
  control_port: number;
  stdin_port: number;
  hb_port: number;
  transport: string;
  ip: string;
  key: string;
  signature_scheme: string;
}

export interface KernelSession {
  sessionId: string;
  runtimeId: string;
  kernelSpec: KernelSpecType;
  connectionInfo: ConnectionInfo;
  processId?: number;
  state: 'starting' | 'idle' | 'busy' | 'dead';
  workingDirectory: string;
  environmentVariables: Record<string, string>;
}

export interface JupyterMessage<T = any> {
  zmq_identities: Buffer[];
  header: JupyterHeader;
  parent_header?: JupyterHeader;
  metadata: Record<string, any>;
  content: T;
  buffers?: Buffer[];
}

export interface JupyterHeader {
  msg_id: string;
  username: string;
  session: string;
  date: string;
  msg_type: string;
  version: string;
}

export interface WebSocketMessage {
  type: 'jupyter_message' | 'heartbeat' | 'error';
  channel: 'shell' | 'iopub' | 'control' | 'stdin';
  message?: JupyterMessage;
  error?: string;
}

// Re-export types from other modules for convenience
export { JupyterKernelSpec, RuntimeMetadata } from './kernel.js';
export * from './messages.js';
