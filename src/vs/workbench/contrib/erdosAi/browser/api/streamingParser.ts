/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionCall, ErrorResponse } from './types.js';

/**
 * Interface for parsed SSE events
 */
export interface ParsedEvent {
    type: 'data' | 'comment' | 'id' | 'retry' | 'unknown';
    data?: any;
    id?: string;
    retry?: number;
}

/**
 * Interface for streaming data extracted from parsed events
 */
export interface StreamData {
    type: 'content' | 'function_call' | 'error' | 'done' | 'function_delta' | 'function_complete' | 'thinking' | 'end_turn' | 'ai_stream_data';
    content?: string;
    functionCall?: FunctionCall;
    error?: ErrorResponse;
    delta?: string;
    field?: string;
    call_id?: string;
    response?: string;
    isComplete?: boolean;
    thinking?: boolean;
    end_turn?: boolean;
    messageId?: string;
    requestId?: string;
    sequence?: number;
    isCancelled?: boolean;
    isFunctionCall?: boolean;
}

/**
 * Parser for Server-Sent Events (SSE) streaming responses

 */
export class SSEParser {
    private lineBuffer = '';
    
    private malformedJsonCount = 0;

    /**
     * Parse raw SSE chunk into events
     * @param chunk Raw text chunk from stream
     * @returns Array of parsed events
     */
    public parse(chunk: string): ParsedEvent[] {
        const events: ParsedEvent[] = [];
        
        // Add to buffer from previous incomplete chunks
        const bufferedText = this.lineBuffer + chunk;
        
        // Split by newlines to get complete lines
        const lines = bufferedText.split('\n');
        
        // If the chunk doesn't end with \n, the last line is incomplete
        if (!bufferedText.endsWith('\n')) {
            // Save the incomplete line for next chunk
            this.lineBuffer = lines[lines.length - 1];
            // Process only the complete lines
            lines.splice(-1, 1);
        } else {
            // All lines are complete, clear buffer
            this.lineBuffer = '';
        }
        
        // Process complete lines only
        for (const line of lines) {
            const trimmedLine = line.trim();
            const event = this.parseSSELine(trimmedLine);
            if (event) {
                events.push(event);
            }
        }
        
        return events;
    }

    /**
     * Handle function call completion and create final function_call event
     */
    public handleFunctionCallCompletion(field: string, call_id: string): StreamData | null {
        // All streaming function call functionality removed
        return null;
    }




    /**
     * Parse a single SSE line into an event
     * @param line SSE line to parse
     * @returns Parsed event or null if invalid
     */
    public parseSSELine(line: string): ParsedEvent | null {

        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('data: ')) {
            const jsonData = trimmedLine.substring(6); // Remove 'data: ' prefix (6 characters)
            if (jsonData.length > 0 && jsonData !== '[DONE]') {

                try {
                    return {
                        type: 'data',
                        data: JSON.parse(jsonData)
                    };
                } catch (error) {
                    this.malformedJsonCount++;
                    

                    return null;
                }
            }
        } else if (line.startsWith('id: ')) {
            return {
                type: 'id',
                id: line.substring(4)
            };
        } else if (line.startsWith('retry: ')) {
            const retryValue = parseInt(line.substring(7), 10);
            if (!isNaN(retryValue)) {
                return {
                    type: 'retry',
                    retry: retryValue
                };
            }
        } else if (line.startsWith(': ')) {
            return {
                type: 'comment'
            };
        }
        
        return null;
    }

    /**
     * Handle a data line and extract stream data
     * @param data Parsed JSON data from SSE event
     * @returns Stream data or null if no relevant data
     */
    public handleDataLine(data: any): StreamData | null {

        // Or: { action: "function_call", function_call: {...}, ... }
        // Or: { isComplete: true, response: "...", ... }
        
        // RAO logic: only process deltas with content (nchar(event_data$delta) > 0)
        if (data.delta !== undefined && typeof data.delta === 'string' && data.delta.length > 0) {

            if (data.field && data.call_id) {
                return this.handleFieldDelta(data);
            }
            
            // Regular text delta - provide both delta (for rao compatibility) and content (for UI compatibility)
            return {
                type: 'content',
                content: data.delta,  // UI expects this field
                delta: data.delta     // Rao-style processing expects this field
            };
        }

        if (data.action === 'function_call' && data.function_call) {
            const functionCall = data.function_call;
            return {
                type: 'function_call',
                functionCall: {
                    name: functionCall.name,
                    arguments: functionCall.arguments, // Keep as string (JSON)
                    call_id: functionCall.call_id,
                    msg_id: functionCall.msg_id || 0
                }
            } as StreamData;
        }


        if (data.field && data.call_id && data.isComplete === true) {

            return this.handleFieldCompletion(data);
        }

        if (data.isComplete === true) {

            if (data.action === 'function_call' && data.function_call) {
                return {
                    type: 'function_call',
                    functionCall: {
                        name: data.function_call.name,
                        arguments: data.function_call.arguments,
                        call_id: data.function_call.call_id,
                        msg_id: data.function_call.msg_id || 0
                    }
                } as StreamData;
            }
            
            if (data.response) {
                // Text completion event - signal completion for this phase
                return {
                    type: 'done',
                    isComplete: true
                };
            }
            
            // Only signal true completion if we have end_turn or no other completion type
            if (data.end_turn === true) {
                return {
                    type: 'done',
                    end_turn: true
                };
            }
            
            // Default completion event
            return {
                type: 'done',
                isComplete: true
            };
        }

        if (data.error) {
            return {
                type: 'error',
                error: typeof data.error === 'string' ? { message: data.error } : data.error
            };
        }

        return null;
    }

    /**

     * @param data Field delta event data
     * @returns Stream data for field delta
     */
    private handleFieldDelta(data: any): StreamData | null {
        // Handle function_delta events for streaming content into widgets
        if (data.field && data.call_id && data.delta) {
            let deltaText: string = data.delta;

            // For console/terminal, RAO streams command text, not JSON
            if (typeof data.delta === 'string' && (data.field === 'run_console_cmd' || data.field === 'run_terminal_cmd')) {
                try {
                    const parsed = JSON.parse(data.delta);
                    if (parsed && typeof parsed === 'object' && typeof parsed.command === 'string') {
                        deltaText = parsed.command;
                    }
                } catch {
                    // leave as-is if not JSON
                }
            }

            return {
                type: 'function_delta',
                field: data.field,
                call_id: data.call_id,
                delta: deltaText
            };
        }
        return null;
    }

    /**

     * @param data Field completion event data
     * @returns Stream data for completed function
     */
    private handleFieldCompletion(data: any): StreamData | null {
        // Handle function completion events for widget finalization
        if (data.field && data.call_id && data.isComplete === true) {
            return {
                type: 'function_complete',
                field: data.field,
                call_id: data.call_id,
                isComplete: true
            };
        }
        return null;
    }

    /**
     * Reset the parser state
     */
    public reset(): void {
        this.lineBuffer = '';
        this.malformedJsonCount = 0;
    }

    /**
     * Get the current line buffer content
     */
    public getBufferContent(): string {
        return this.lineBuffer;
    }
}
