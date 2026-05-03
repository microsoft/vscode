/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	mode?: string;
	timestamp?: number;
}

export interface ChatSession {
	id: string;
	user_id: string;
	name: string;
	messages: ChatMessage[];
	created_at: number;
	updated_at: number;
	workspace_id?: string;
	workspace_path?: string;
}

export interface SessionSummary {
	id: string;
	name: string;
	message_count: number;
	created_at: number;
	updated_at: number;
	last_message_preview?: string;
}

export interface SessionListResponse {
	sessions: SessionSummary[];
	total: number;
}

export function createSessionsApi(transport: Transport) {
	return {
		createSession: async (
			name: string = 'New Chat',
			userId: string = 'default'
		): Promise<ChatSession> => {
			return await transport.post('/api/sessions/create', {
				name,
				user_id: userId
			});
		},

		listSessions: async (
			userId: string = 'default',
			limit: number = 50,
			offset: number = 0
		): Promise<SessionListResponse> => {
			return await transport.get(
				`/api/sessions/list/${userId}?limit=${limit}&offset=${offset}`
			);
		},

		loadSession: async (
			sessionId: string,
			userId: string = 'default'
		): Promise<ChatSession> => {
			return await transport.get(
				`/api/sessions/load/${sessionId}?user_id=${userId}`
			);
		},

		saveSession: async (
			session: {
				id: string;
				name: string;
				messages: ChatMessage[];
				workspace_id?: string;
				workspace_path?: string;
			},
			userId: string = 'default'
		): Promise<ChatSession> => {
			return await transport.post(`/api/sessions/save?user_id=${userId}`, session);
		},

		addMessage: async (
			sessionId: string,
			message: {
				role: string;
				content: string;
				mode?: string;
			},
			userId: string = 'default'
		): Promise<ChatSession> => {
			return await transport.post(
				`/api/sessions/message/${sessionId}?user_id=${userId}`,
				message
			);
		},

		deleteSession: async (
			sessionId: string,
			userId: string = 'default'
		): Promise<{ status: string; session_id: string }> => {
			return await transport.delete(
				`/api/sessions/${sessionId}?user_id=${userId}`
			);
		},

		renameSession: async (
			sessionId: string,
			name: string,
			userId: string = 'default'
		): Promise<{ status: string; session_id: string; name: string }> => {
			return await transport.put(
				`/api/sessions/rename/${sessionId}?name=${encodeURIComponent(name)}&user_id=${userId}`
			);
		},

		searchSessions: async (
			query: string,
			userId: string = 'default',
			limit: number = 10
		): Promise<SessionListResponse> => {
			return await transport.get(
				`/api/sessions/search?query=${encodeURIComponent(query)}&user_id=${userId}&limit=${limit}`
			);
		}
	};
}
