/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export interface ExecutionTask {
	task_id: string;
	name: string;
	description: string;
	platform: string;
	operation: string;
	dependencies: string[];
	status: string;
	estimated_cost: number;
	actual_cost: number;
	result?: any;
	error?: string;
}

export interface PlanResponse {
	plan_id: string;
	status: string;
	tasks: ExecutionTask[];
	estimated_cost: number;
	message: string;
}

export interface PlanModification {
	remove_tasks?: string[];
	reorder?: string[];
	update_platform?: Record<string, string>;
}

export function createOrchestrateApi(transport: Transport) {
	return {
		deployGeneratedCode: async (
			prompt: string,
			repoName: string,
			projectName: string,
			userId: string = 'default'
		): Promise<{
			success: boolean;
			steps: Array<{ step: string; success: boolean; error?: string; data?: any }>;
			deployment_url?: string;
		}> => {
			try {
				return await transport.post('/api/orchestrate/deploy', {
					prompt,
					repo_name: repoName,
					project_name: projectName,
					user_id: userId
				});
			} catch (error) {
				return {
					success: false,
					steps: [{
						step: 'error',
						success: false,
						error: error instanceof Error ? error.message : 'Deployment failed'
					}]
				};
			}
		},

		generatePlan: async (
			request: string,
			userId: string = 'default',
			workspacePath?: string
		): Promise<PlanResponse> => {
			return await transport.post('/api/orchestrate/plan', {
				request,
				user_id: userId,
				workspace_path: workspacePath
			});
		},

		getPlan: async (planId: string): Promise<any> => {
			return await transport.get(`/api/orchestrate/plan/${planId}`);
		},

		approvePlan: async (planId: string): Promise<{
			plan_id: string;
			status: string;
			tasks: ExecutionTask[];
			actual_cost: number;
			message: string;
		}> => {
			return await transport.post(`/api/orchestrate/approve/${planId}`, {});
		},

		cancelPlan: async (planId: string): Promise<{
			plan_id: string;
			status: string;
			message: string;
		}> => {
			return await transport.post(`/api/orchestrate/cancel/${planId}`, {});
		},

		modifyPlan: async (
			planId: string,
			modification: PlanModification
		): Promise<PlanResponse> => {
			return await transport.post(`/api/orchestrate/modify/${planId}`, modification);
		},

		listPlans: async (userId?: string): Promise<{
			count: number;
			plans: Array<{
				plan_id: string;
				status: string;
				user_request: string;
				task_count: number;
				estimated_cost: number;
				created_at: string;
			}>;
		}> => {
			const url = userId
				? `/api/orchestrate/plans?user_id=${encodeURIComponent(userId)}`
				: '/api/orchestrate/plans';
			return await transport.get(url);
		}
	};
}

