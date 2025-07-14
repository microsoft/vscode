/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface Task {
		id: string;
		name: string;
		user_id: number;
		agent_id: number;
		state: string;
		owner_id: number;
		repo_id: number;
		resource_type: string;
		resource_id: number;
		last_updated_at: string;
		created_at: string;
		completed_at?: string;
		event_url?: string;
		event_type?: string;
		event_identifiers?: string[];
		workflow_run_id?: number;
		premium_requests?: number;
		error?: {
			message: string;
		};
	}

	export interface SessionInfo {
		id: string;
		name: string;
		user_id: number;
		agent_id: number;
		logs: string;
		logs_blob_id: string;
		state: string;
		owner_id: number;
		repo_id: number;
		resource_type: string;
		resource_id: number;
		last_updated_at: string;
		created_at: string;
		completed_at: string;
		event_type: string;
		workflow_run_id: number;
		premium_requests: number;
		error: string | null;
	}

	export interface CodingAgentInformationProvider {
		provideAllSessions(token: CancellationToken): Thenable<Task[]>;
		provideSessionDetails(id: string, token: CancellationToken): Thenable<SessionInfo>;
	}

	export namespace ai {
		export function registerCodingAgentInformationProvider(provider: CodingAgentInformationProvider): Disposable;
	}
}
