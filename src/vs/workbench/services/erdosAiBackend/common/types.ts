/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionCall, Attachment, ConversationMessage } from '../../erdosAi/common/conversationTypes.js';

export interface BackendConfig {
    url: string;
    environment: 'local' | 'production';
    timeout: number;
}

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

export interface HealthResponse {
    status: 'UP' | 'DOWN';
    components?: Record<string, any>;
}

export interface BackendRequest {
    request_type: 'ai_api_call' | 'generate_conversation_name' | 'summarize_conversation';
    conversation: ConversationMessage[];
    provider: string;
    model: string | null;
    temperature: number | null;
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

export interface AttachedImage {
    filename: string;
    original_path: string;
    local_path: string;
    mime_type: string;
    base64_data: string;
    timestamp: string;
}

export interface EnvironmentInfo {
    os: string;
    version: string;
    language_runtime?: string;
    workspace_folder?: string;
}

export interface BackendResponse {
    success: boolean;
    data?: any;
    error?: ErrorResponse;
}

export interface ErrorResponse {
    message: string;
    type: string;
    details?: Record<string, any>;
}

export interface StreamChunk {
    type: 'content' | 'function_call' | 'error' | 'done';
    data?: any;
    content?: string;
    function_call?: FunctionCall;
    error?: ErrorResponse;
}

export interface AttachmentResponse {
    success: boolean;
    attachment_id?: string;
    upload_url?: string;
    error?: string;
}

export const TIMING_CONFIG = {
    REQUEST_TIMEOUT: 30000,
    HEALTH_CHECK_TIMEOUT: 15000,
    STREAM_TIMEOUT: 60000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    BACKOFF_MULTIPLIER: 2
} as const;

export const NON_RETRYABLE_ERROR_TYPES = [
    'authentication_error',
    'invalid_request',
    'quota_exceeded',
    'model_not_found',
    'validation_error'
] as const;
