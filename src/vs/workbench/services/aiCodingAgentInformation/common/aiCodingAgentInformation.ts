/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiCodingAgentInformationService = createDecorator<IAiCodingAgentInformationService>('IAiCodingAgentInformationService');

export interface AiTask {
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

export interface AiSessionInfo {
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

export interface IAiCodingAgentInformationService {
	isEnabled(): boolean;
	registerCodingAgentProvider(provider: IAiCodingAgentInformationProvider): IDisposable;
	getAllSessionFromProviders(token: CancellationToken): Promise<AiTask[]>;
	getSessionDetailsFromProviders(id: string, token: CancellationToken): Promise<AiSessionInfo[]>;
}

export interface IAiCodingAgentInformationProvider {
	getAllSessions(token: CancellationToken): Promise<AiTask[]>;
	getSessionDetails(id: string, token: CancellationToken): Promise<AiSessionInfo | undefined>;
}
