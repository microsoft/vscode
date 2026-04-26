/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export function createCognitiveApi(transport: Transport) {
	return {
		sendMessage: async (message: string): Promise<any> => {
			return await transport.post('/api/cognitive/classify', { message });
		},

		classifyIntent: async (userRequest: string, workspacePath?: string): Promise<any> => {
			try {
				return await transport.post('/api/cognitive/classify', {
					user_request: userRequest,
					workspace_path: workspacePath
				});
			} catch {
				return {
					intent: 'UNKNOWN',
					confidence: 0,
					sub_intents: [],
					entities: {},
					complexity: 'MEDIUM',
					error: 'Classification failed'
				};
			}
		},

		decomposeRequest: async (userRequest: string, workspacePath?: string): Promise<any> => {
			try {
				return await transport.post('/api/cognitive/decompose', {
					user_request: userRequest,
					workspace_path: workspacePath
				});
			} catch {
				return {
					tasks: [],
					dag: {},
					parallel_groups: [],
					execution_order: [],
					error: 'Decomposition failed'
				};
			}
		},

		getSimilarDecisions: async (request: string, limit: number = 3): Promise<any[]> => {
			try {
				const response = await transport.get(
					`/api/cognitive/similar-decisions?request=${encodeURIComponent(request)}&limit=${limit}`
				);
				return response || [];
			} catch {
				return [];
			}
		}
	};
}

