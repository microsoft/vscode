/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Jupyter message protocol schemas for the Erdos Kernel Bridge
 * Includes compatibility notes for Ark kernel differences
 */

// Execute Request/Reply Messages
export interface ExecuteRequest {
  code: string;
  silent: boolean;
  store_history: boolean;
  user_expressions: Record<string, any>;  // ARK USES: serde_json::Value
  allow_stdin: boolean;
  stop_on_error: boolean;
}

export interface ExecuteReply {
  status: 'ok' | 'error';              // ARK DIFFERENCE: No 'abort' status in Ark
  execution_count: number;              // ARK USES: u32 (need conversion to/from TypeScript number)
  user_expressions: Record<string, any>; // ARK USES: serde_json::Value, always present
  payload?: any[];                      // ARK DIFFERENCE: Missing in Ark implementation
}

export interface ExecuteResult {
  execution_count: number;              // ARK USES: u32 (need conversion)
  data: Record<string, any>;            // ARK USES: serde_json::Value
  metadata: Record<string, any>;        // ARK USES: serde_json::Value
}

// Output Messages
export interface StreamOutput {
  name: 'stdout' | 'stderr';           // ARK USES: Stream enum (Stdout, Stderr) - serialized as strings
  text: string;
}

export interface DisplayData {
  data: Record<string, any>;            // ARK USES: serde_json::Value
  metadata: Record<string, any>;        // ARK USES: serde_json::Value
  transient: Record<string, any>;       // ARK USES: serde_json::Value, always present
}

export interface ErrorOutput {
  ename: string;
  evalue: string;
  traceback: string[];
}

// Kernel Status
export interface KernelStatus {
  execution_state: 'starting' | 'idle' | 'busy';
}

// Completion Messages
export interface CompleteRequest {
  code: string;
  cursor_pos: number;                   // ARK USES: u32 (need conversion to/from TypeScript number)
}

export interface CompleteReply {
  status: 'ok' | 'error';               // ARK ORDER: status first
  matches: string[];                    // ARK USES: Vec<String>
  cursor_start: number;                 // ARK USES: u32 (need conversion)
  cursor_end: number;                   // ARK USES: u32 (need conversion)
  metadata: Record<string, any>;        // ARK USES: serde_json::Value
}

// Inspection Messages
export interface InspectRequest {
  code: string;
  cursor_pos: number;                   // ARK USES: u32 (need conversion)
  detail_level: number;                 // ARK USES: u32 (need conversion) - not limited to 0|1
}

export interface InspectReply {
  status: 'ok' | 'error';
  found: boolean;
  data: Record<string, any>;            // ARK USES: serde_json::Value
  metadata: Record<string, any>;        // ARK USES: serde_json::Value
}

// Code Completion Check Messages
export interface IsCompleteRequest {
  code: string;
}

export interface IsCompleteReply {
  status: 'complete' | 'incomplete' | 'invalid' | 'unknown';
  indent: string;                       // ARK DIFFERENCE: Always present, not optional
}

// Comm Messages (for LSP, UI, plots, variables, help, connections)
export interface CommOpen {
  comm_id: string;
  target_name: string;
  data: Record<string, any>;            // ARK USES: serde_json::Value
}

export interface CommMessage {
  comm_id: string;
  data: Record<string, any>;            // ARK USES: serde_json::Value
}

export interface CommClose {
  comm_id: string;
  data?: Record<string, any>;           // ARK DIFFERENCE: Missing in Ark - only comm_id present
}

// Input Messages
export interface InputRequest {
  prompt: string;
  password: boolean;
}

export interface InputReply {
  value: string;
}

// Control Messages
export interface InterruptRequest {}

export interface InterruptReply {
  status: 'ok' | 'error';               // ARK INCLUDES: Status field (always present)
}

export interface ShutdownRequest {
  restart: boolean;
}

export interface ShutdownReply {
  status: 'ok' | 'error';               // ARK INCLUDES: Status field (always present)
  restart: boolean;
}

// Kernel Info Messages
export interface KernelInfoRequest {}

export interface KernelInfoReply {
  status: 'ok' | 'error';               // ARK INCLUDES: Status field (always present)
  language_info: {                      // ARK STRUCTURE: LanguageInfo struct
    name: string;
    version: string;
    mimetype: string;
    file_extension: string;
  };
  banner: string;
  debugger: boolean;                    // ARK DIFFERENCE: Always present, not optional
  help_links: Array<{                   // ARK DIFFERENCE: Always present, not optional  
    text: string;
    url: string;
  }>;
  // ARK MISSING: protocol_version, implementation, implementation_version
}

// History Messages - ARK STATUS: Not implemented in Ark kernel
export interface HistoryRequest {
  output: boolean;
  raw: boolean;
  hist_access_type: 'range' | 'tail' | 'search';
  session?: number;
  start?: number;
  stop?: number;
  n?: number;
  pattern?: string;
  unique?: boolean;
}

export interface HistoryReply {
  status: 'ok' | 'error';
  history: Array<[number, number, string | [string, string]]>;
}

// Union types for message content validation
export type MessageContent = 
  | ExecuteRequest | ExecuteReply | ExecuteResult
  | StreamOutput | DisplayData | ErrorOutput
  | KernelStatus
  | CompleteRequest | CompleteReply
  | InspectRequest | InspectReply
  | IsCompleteRequest | IsCompleteReply
  | CommOpen | CommMessage | CommClose
  | InputRequest | InputReply
  | InterruptRequest | InterruptReply
  | ShutdownRequest | ShutdownReply
  | KernelInfoRequest | KernelInfoReply
  | HistoryRequest | HistoryReply;




