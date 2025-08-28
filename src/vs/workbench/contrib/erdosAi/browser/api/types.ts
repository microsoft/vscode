/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Backend configuration interface
 */
export interface BackendConfig {
    url: string;
    environment: 'local' | 'production';
    timeout: number;
}

/**
 * Backend environment definitions
 */
export const BACKEND_ENVIRONMENTS = {
    local: {
        url: 'http://localhost:8080',
        name: 'Local Development'
    },
    production: {
        url: 'https://api.lotas.ai',
        name: 'Production'
    }
} as const;

/**
 * Health check response from backend
 */
export interface HealthResponse {
    status: 'UP' | 'DOWN';
    components?: Record<string, any>;
}

/**
 */
export interface BackendRequest {
    request_type: 'ai_api_call' | 'generate_conversation_name' | 'summarize_conversation';
    conversation: ConversationMessage[];
    provider: string;
    model: string | null;
    temperature: number | null;  // Can be null for conversation naming
    request_id: string;
    client_version: string;
    app_type: string;
    user_os_version: string;
    user_workspace_path: string;
    user_shell: string;
    symbols_note?: any;
    project_layout?: string;
    user_rules?: string[];
    attachments?: Attachment[];
    has_attachments?: boolean;
    vector_store_id?: string;
    auth: {
        api_key: string;
    };
}

/**
 * Attached image structure for backend (matches Rao's format)
 */
export interface AttachedImage {
    filename: string;
    original_path: string;
    local_path: string;
    mime_type: string;
    base64_data: string;
    timestamp: string;
}

/**
 * Conversation message structure
 */
export interface ConversationMessage {
    id: number;
    role?: 'user' | 'assistant';
    content?: string;
    related_to?: number;
    original_query?: boolean;
    procedural?: boolean;
    function_call?: FunctionCall;
    timestamp: string;
    type?: string;
    call_id?: string;
    output?: string;
}

/**
 */
export interface FunctionCall {
    /** Function name ("read_file", "grep_search", etc.) */
    name: string;
    /** JSON string format (not object) */
    arguments: string;
    /** Format: "call_[alphanumeric]" or "toolu_[alphanumeric]" */
    call_id: string;
    /** Matches message ID */
    msg_id: number;
}

/**
 * Attachment structure
 */
export interface Attachment {
    file_path: string;
    file_name: string;
    file_size: number;
    file_type: string;
    upload_url?: string;
    attachment_id?: string;
}

/**
 * Context data structure
 */
export interface ContextData {
    files?: string[];
    directories?: string[];
    documentation?: Record<string, string>;
    conversations?: number[];
}

/**
 * Environment information
 */
export interface EnvironmentInfo {
    os: string;
    version: string;
    language_runtime?: string;
    workspace_folder?: string;
}

/**
 * Backend response wrapper
 */
export interface BackendResponse {
    success: boolean;
    data?: any;
    error?: ErrorResponse;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
    message: string;
    type: string;
    details?: Record<string, any>;
}

/**
 * Streaming chunk data
 */
export interface StreamChunk {
    type: 'content' | 'function_call' | 'error' | 'done';
    data?: any;
    content?: string;
    function_call?: FunctionCall;
    error?: ErrorResponse;
}

/**
 * Attachment upload response
 */
export interface AttachmentResponse {
    success: boolean;
    attachment_id?: string;
    upload_url?: string;
    error?: string;
}

/**
 * Timing configuration constants
 */
export const TIMING_CONFIG = {
    REQUEST_TIMEOUT: 30000,
    HEALTH_CHECK_TIMEOUT: 15000,
    STREAM_TIMEOUT: 60000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    BACKOFF_MULTIPLIER: 2
} as const;

/**
 * Non-retryable error types
 */
export const NON_RETRYABLE_ERROR_TYPES = [
    'authentication_error',
    'invalid_request',
    'quota_exceeded',
    'model_not_found',
    'validation_error'
] as const;
