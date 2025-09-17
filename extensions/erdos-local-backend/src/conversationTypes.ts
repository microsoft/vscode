/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Message metadata for different message types
 */
export interface MessageMetadata {
    /** Links to parent message ID */
    related_to?: number;
    /** True for initial conversation query */
    original_query?: boolean;
    /** True to hide from conversation UI */
    procedural?: boolean;
    /** True if message was cancelled */
    cancelled?: boolean;
    /** OpenAI reasoning models only - format: "resp_[hex]" */
    response_id?: string;
    /** True for cancelled partial responses */
    partial_content?: boolean;
    /** Format: "req_[timestamp]_[number]" for API request tracking */
    request_id?: string;
    source_function?: string;
    /** Reserved for future use - widget functionality removed */
    modified_script?: string;
    /** Marks function result */
    type?: 'function_call_output';
    /** Links to function_call.call_id */
    call_id?: string;
    /** Function execution result */
    output?: string;
    /** Starting line number of read range */
    start_line?: number | object;
    /** Ending line number of read range */
    end_line?: number | object;
    /** Insert position for edit operations */
    insert_line?: number | object;
    /** Plot names array */
    plots?: string[];
    /** Full path to plots JSON file */
    plots_file?: string;
}

/**
 * Function call structure
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
 * Conversation message structure
 */
export interface ConversationMessage extends MessageMetadata {
    /** Unique message identifier (auto-assigned sequential integer) */
    id: number;
    /** Message sender - OPTIONAL for function_call_output entries */
    role?: 'user' | 'assistant';
    /** Message content text - OPTIONAL for function_call_output entries */
    content?: string;
    /** Thinking content from Claude's internal reasoning (displayed in light gray) */
    thinking?: string;
    /** ISO timestamp */
    timestamp: string;
    /** Function call data */
    function_call?: FunctionCall;
    /** UI-only flag - when true, message is for display only and not saved to conversation log */
    isDisplayOnly?: boolean;
    /** UI-only flag - when true, message is a function call display message during streaming */
    isFunctionCallDisplay?: boolean;
}


