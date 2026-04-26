/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export interface HistoryItem {
	id: number;
	workflow_id: string;
	task_id: string;
	user_id: string;
	platform: string;
	operation: string;
	status: string;
	cost_usd: number;
	is_rolled_back: boolean;
	can_rollback: boolean;
	started_at?: string;
	completed_at?: string;
}

export interface RollbackableItem {
	id: number;
	workflow_id: string;
	task_id: string;
	platform: string;
	operation: string;
	completed_at?: string;
	rollback_operation?: string;
}

export interface RollbackInfo {
	history_id: number;
	platform: string;
	original_operation: string;
	original_params?: Record<string, any>;
	rollback_operation?: string;
	rollback_params?: Record<string, any>;
	will_restore_to?: Record<string, any>;
	executed_at?: string;
	is_rolled_back: boolean;
	warning?: string;
}

export interface RollbackResponse {
	success: boolean;
	message: string;
	rolled_back_state?: Record<string, any>;
	rollback_result?: Record<string, any>;
}

export interface HistoryStats {
	total_executions: number;
	successful: number;
	failed: number;
	rolled_back: number;
	total_cost_usd: number;
	success_rate: number;
}

export function createHistoryApi(transport: Transport) {
	return {
		getUserHistory: async (
			userId: string = 'default',
			limit: number = 50,
			offset: number = 0
		): Promise<HistoryItem[]> => {
			const url = `/api/history/user/${encodeURIComponent(userId)}?limit=${limit}&offset=${offset}`;
			return await transport.get(url);
		},

		getWorkflowHistory: async (workflowId: string): Promise<HistoryItem[]> => {
			return await transport.get(`/api/history/workflow/${encodeURIComponent(workflowId)}`);
		},

		getRollbackable: async (userId: string = 'default'): Promise<RollbackableItem[]> => {
			return await transport.get(`/api/history/rollbackable/${encodeURIComponent(userId)}`);
		},

		getRollbackInfo: async (historyId: number): Promise<RollbackInfo> => {
			return await transport.get(`/api/history/rollback-info/${historyId}`);
		},

		rollback: async (historyId: number, userId: string = 'default'): Promise<RollbackResponse> => {
			return await transport.post(`/api/history/rollback/${historyId}?user_id=${encodeURIComponent(userId)}`, {});
		},

		getStats: async (userId: string = 'default'): Promise<HistoryStats> => {
			return await transport.get(`/api/history/stats/${encodeURIComponent(userId)}`);
		},

		getPlatformStats: async (userId: string = 'default'): Promise<Record<string, any>> => {
			return await transport.get(`/api/history/platforms/${encodeURIComponent(userId)}`);
		},

		getHistoryDetail: async (historyId: number): Promise<Record<string, any>> => {
			return await transport.get(`/api/history/${historyId}`);
		}
	};
}
