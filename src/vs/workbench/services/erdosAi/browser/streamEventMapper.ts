/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StreamData } from '../../erdosAiBackend/browser/streamingParser.js';
import { 
	StreamEvent, 
	ContentStreamEvent, 
	FunctionCallStreamEvent, 
	FunctionDeltaStreamEvent, 
	FunctionCompleteStreamEvent, 
	StreamCompleteEvent 
} from '../common/streamingTypes.js';

/**
 * Maps StreamData from backend to typed StreamEvent for orchestrator
 */
export function mapStreamDataToEvent(data: StreamData): StreamEvent | null {
	switch (data.type) {
		case 'content':
			if (data.delta) {
				return {
					type: 'content',
					delta: data.delta
				} as ContentStreamEvent;
			}
			return null;

		case 'function_call':
			if (data.functionCall) {
				return {
					type: 'function_call',
					functionCall: data.functionCall
				} as FunctionCallStreamEvent;
			}
			return null;

		case 'function_delta':
			if (data.call_id && data.field && data.delta) {
				return {
					type: 'function_delta',
					call_id: data.call_id,
					field: data.field,
					delta: data.delta
				} as FunctionDeltaStreamEvent;
			}
			return null;

		case 'function_complete':
			if (data.call_id && data.field) {
				return {
					type: 'function_complete',
					call_id: data.call_id,
					field: data.field
				} as FunctionCompleteStreamEvent;
			}
			return null;

		case 'done':
			return {
				type: 'done',
				isComplete: data.isComplete || false
			} as StreamCompleteEvent;

		default:
			// Ignore other types like 'thinking', 'error', etc.
			return null;
	}
}
