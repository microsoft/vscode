/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export function createMemoryApi(transport: Transport) {
	return {
		indexWorkspace: async (workspacePath: string): Promise<any> => {
			try {
				return await transport.post('/api/memory/index', { workspace_path: workspacePath });
			} catch (error) {
				// preserve existing behavior: log + rethrow
				console.error('Failed to index workspace:', error);
				throw error;
			}
		},

		queryMemory: async (workspaceId: string, query: string, limit: number = 5): Promise<any> => {
			try {
				return await transport.get(
					`/api/memory/query?workspace_id=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}&limit=${limit}`
				);
			} catch {
				return { entries: [], total: 0 };
			}
		},

		getTaskContext: async (workspaceId: string, task: string): Promise<any> => {
			try {
				return await transport.get(
					`/api/memory/context?workspace_id=${encodeURIComponent(workspaceId)}&task=${encodeURIComponent(task)}`
				);
			} catch {
				return { relevant_files: [], code_snippets: [], languages_involved: [], total_matches: 0 };
			}
		},

		listIndexedWorkspaces: async (): Promise<any[]> => {
			try {
				const response = await transport.get('/api/memory/workspaces');
				return response?.workspaces || [];
			} catch {
				return [];
			}
		}
	};
}

