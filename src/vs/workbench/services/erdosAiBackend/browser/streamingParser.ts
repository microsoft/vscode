/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorResponse } from '../common/types.js';
import { FunctionCall } from '../../erdosAi/common/conversationTypes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISSEParser } from '../common/streamingParser.js';

export interface ParsedEvent {
    type: 'data' | 'comment' | 'id' | 'retry' | 'unknown';
    data?: any;
    id?: string;
    retry?: number;
}

export interface StreamData {
    type: 'content' | 'function_call' | 'error' | 'done' | 'function_delta' | 'function_complete' | 'thinking' | 'end_turn' | 'ai_stream_data';
    conversationId: number;
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

export class SSEParser extends Disposable implements ISSEParser {
    readonly _serviceBrand: undefined;
    private lineBuffer = '';
    
    private malformedJsonCount = 0;
    public conversationId?: number;

    constructor() {
        super();
    }

    public parse(chunk: string): ParsedEvent[] {
        const events: ParsedEvent[] = [];
        
        const bufferedText = this.lineBuffer + chunk;
        
        const lines = bufferedText.split('\n');
        
        if (!bufferedText.endsWith('\n')) {
            this.lineBuffer = lines[lines.length - 1];
            lines.splice(-1, 1);
        } else {
            this.lineBuffer = '';
        }
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            const event = this.parseSSELine(trimmedLine);
            if (event) {
                events.push(event);
            }
        }
        
        return events;
    }

    public parseSSELine(line: string): ParsedEvent | null {

        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('data: ')) {
            const jsonData = trimmedLine.substring(6);
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

	public handleDataLine(data: any): StreamData | null {
		if (data.delta !== undefined && typeof data.delta === 'string' && data.delta.length > 0) {

			if (data.field && data.call_id) {
				return this.handleFieldDelta(data);
			}
			
			return {
				type: 'content' as const,
				conversationId: this.conversationId!,
				content: data.delta,
				delta: data.delta
			};
		}

		if (data.action === 'function_call' && data.function_call) {
			const functionCall = data.function_call;
			return {
				type: 'function_call',
				conversationId: this.conversationId!,
				functionCall: {
					name: functionCall.name,
					arguments: functionCall.arguments,
					call_id: functionCall.call_id,
					msg_id: functionCall.msg_id || 0
				}
			} as StreamData;
		}

		// Handle web_search_call events
		if (data.web_search_call && data.web_search_call.query) {
			// Convert web_search_call to a function_call format so it's displayed
			return {
				type: 'function_call',
				conversationId: this.conversationId!,
				functionCall: {
					name: 'web_search',
					arguments: JSON.stringify({ query: data.web_search_call.query }),
					call_id: data.web_search_call.id || 'web_search_' + Date.now(),
					msg_id: 0
				}
			} as StreamData;
		}

		// Handle web_search_results events - the search results are used by the AI model on the backend
		// We don't need to display them separately
		if (data.web_search_results) {
			return null;
		}

        if (data.field && data.call_id && data.isComplete === true) {
            return this.handleFieldCompletion(data);
        }

        if (data.isComplete === true) {

            if (data.action === 'function_call' && data.function_call) {
                return {
                    type: 'function_call',
                    conversationId: this.conversationId!,
                    functionCall: {
                        name: data.function_call.name,
                        arguments: data.function_call.arguments,
                        call_id: data.function_call.call_id,
                        msg_id: data.function_call.msg_id || 0
                    }
                } as StreamData;
            }
            
            if (data.response) {
                return {
                    type: 'done' as const,
                    conversationId: this.conversationId!,
                    isComplete: true
                };
            }
            
            if (data.end_turn === true) {
                return {
                    type: 'done' as const,
                    conversationId: this.conversationId!,
                    end_turn: true
                };
            }
            
            return {
                type: 'done' as const,
                conversationId: this.conversationId!,
                isComplete: true
            };
        }

        if (data.error) {
            return {
                type: 'error' as const,
                conversationId: this.conversationId!,
                error: typeof data.error === 'string' ? { message: data.error } : data.error
            };
        }

        return null;
    }

    private handleFieldDelta(data: any): StreamData | null {
        if (data.field && data.call_id && data.delta) {
            let deltaText: string = data.delta;

            if (typeof data.delta === 'string' && (data.field === 'run_console_cmd' || data.field === 'run_terminal_cmd')) {
                try {
                    const parsed = JSON.parse(data.delta);
                    if (parsed && typeof parsed === 'object' && typeof parsed.command === 'string') {
                        deltaText = parsed.command;
                    }
                } catch {
                }
            }

            return {
                type: 'function_delta',
                conversationId: this.conversationId!,
                field: data.field,
                call_id: data.call_id,
                delta: deltaText
            };
        }
        return null;
    }

    private handleFieldCompletion(data: any): StreamData | null {
        if (data.field && data.call_id && data.isComplete === true) {
            return {
                type: 'function_complete',
                conversationId: this.conversationId!,
                field: data.field,
                call_id: data.call_id,
                isComplete: true
            };
        }
        return null;
    }

    public reset(): void {
        this.lineBuffer = '';
        this.malformedJsonCount = 0;
    }
}
