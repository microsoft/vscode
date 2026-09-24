/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isStringArray } from '../../../../../base/common/types.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../nls.js';
import { GitHubApiClient, GitHubApiError, GitHubAuthenticationError, IGitHubApiResponse } from '../../../github/browser/githubApiClient.js';
import { AutomationMutationUncertainError } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';

export interface ICloudAutomationRepository {
	readonly owner: string;
	readonly name: string;
}

export interface ICloudAutomationTrigger {
	readonly types: readonly string[];
	readonly [key: string]: string | number | boolean | null | readonly string[];
}

export interface ICloudAutomationSummary {
	readonly id: string;
	readonly name: string;
	readonly prompt?: string;
	readonly disabled?: boolean;
	readonly disabled_state?: { readonly reason: string } | null;
	readonly repository?: ICloudAutomationRepository | null;
	readonly triggers?: Readonly<Record<string, ICloudAutomationTrigger>> | null;
	readonly tools?: readonly string[] | null;
	readonly model?: string | null;
	readonly reasoning_effort?: string | null;
	readonly require_actor_write_permission?: boolean;
	readonly created_at: string;
	readonly updated_at: string;
}

export interface ICloudAutomationDefinition extends ICloudAutomationSummary {
	readonly prompt: string;
}

export interface ICloudAutomationMutation {
	readonly name?: string;
	readonly prompt?: string;
	readonly disabled?: boolean;
	readonly triggers?: Readonly<Record<string, ICloudAutomationTrigger>>;
	readonly tools?: readonly string[];
	readonly model?: string;
	readonly reasoning_effort?: string;
}

export interface ICloudAutomationTask {
	readonly id: string;
	readonly automation_id?: string;
	readonly state: string;
	readonly status?: string | null;
	readonly created_at: string;
	readonly updated_at?: string;
	readonly html_url?: string;
	readonly creator?: { readonly login?: string } | null;
}

interface ICloudAutomationList {
	readonly automations: readonly ICloudAutomationSummary[];
}

export class CloudAutomationApiClient extends Disposable {
	private readonly client: GitHubApiClient;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.client = this._register(instantiationService.createInstance(GitHubApiClient));
	}

	async isPrivateRepository(accountName: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<boolean> {
		const response = await this.client.request<{ readonly private: boolean }>(
			'GET', `/repos/${repositoryPath(repository)}`, 'cloudAutomations.repository',
			{ accountName, token, createAuthenticationSession: false, timeout: 30_000 },
		);
		if (typeof response.data?.private !== 'boolean') {
			throw invalidResponse();
		}
		return response.data.private;
	}

	async requirePrivateRepository(accountName: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<void> {
		if (!await this.isPrivateRepository(accountName, repository, token)) {
			throw new Error(localize('cloudAutomations.privateRepositoryRequired', "Cloud automations currently require a private GitHub repository."));
		}
	}

	async list(accountName: string, repository: ICloudAutomationRepository, token: CancellationToken): Promise<readonly ICloudAutomationDefinition[]> {
		const definitions: ICloudAutomationDefinition[] = [];
		for (let page = 1; page <= 10; page++) {
			const response = await this.request<ICloudAutomationList>(accountName, 'GET', `${repositoryAutomationsPath(repository)}/v2?per_page=100&page=${page}`, token);
			if (!Array.isArray(response.data?.automations)) {
				throw invalidResponse();
			}
			for (const definition of response.data.automations) {
				if (definition.prompt === undefined && typeof definition.id === 'string') {
					definitions.push(await this.get(accountName, repository, definition.id, token));
					continue;
				}
				validateDefinition(definition, repository);
				definitions.push(definition);
			}
			if (!hasNextPage(response.link)) {
				return definitions;
			}
		}
		throw new Error(localize('cloudAutomations.catalogueLimit', "This repository has more cloud automations than can be loaded. Its catalogue is incomplete."));
	}

	async get(accountName: string, repository: ICloudAutomationRepository, id: string, token: CancellationToken): Promise<ICloudAutomationDefinition> {
		const response = await this.request<ICloudAutomationDefinition>(accountName, 'GET', `/agents/automations/${encodeURIComponent(id)}`, token);
		const definition = response.data;
		validateDefinition(definition, repository, id);
		return definition;
	}

	async create(accountName: string, repository: ICloudAutomationRepository, value: ICloudAutomationMutation, token: CancellationToken): Promise<ICloudAutomationDefinition> {
		return this.mutate(token, async () => {
			const response = await this.request<ICloudAutomationDefinition>(accountName, 'POST', repositoryAutomationsPath(repository), token, {
				...value, description: '', mcp_servers: [], require_actor_write_permission: true,
			});
			const definition = response.data;
			validateDefinition(definition, repository);
			return definition;
		});
	}

	async update(accountName: string, repository: ICloudAutomationRepository, id: string, value: ICloudAutomationMutation, token: CancellationToken): Promise<ICloudAutomationDefinition> {
		return this.mutate(token, async () => {
			const response = await this.request<ICloudAutomationDefinition>(accountName, 'PATCH', `${repositoryAutomationsPath(repository)}/${encodeURIComponent(id)}`, token, value);
			const definition = response.data;
			validateDefinition(definition, repository, id);
			return definition;
		});
	}

	async delete(accountName: string, repository: ICloudAutomationRepository, id: string, token: CancellationToken): Promise<void> {
		await this.mutate(token, async () => {
			await this.request(accountName, 'DELETE', `${repositoryAutomationsPath(repository)}/${encodeURIComponent(id)}`, token);
		});
	}

	async run(accountName: string, repository: ICloudAutomationRepository, id: string, event: 'manual' | 'interval', token: CancellationToken): Promise<void> {
		await this.mutate(token, async () => {
			const response = await this.request(accountName, 'POST', `${repositoryAutomationsPath(repository)}/${encodeURIComponent(id)}/tasks`, token, { event });
			if (response.statusCode !== 202) {
				throw invalidResponse();
			}
		});
	}

	async listRuns(accountName: string, id: string, token: CancellationToken): Promise<readonly ICloudAutomationTask[]> {
		const response = await this.request<{ readonly tasks: readonly ICloudAutomationTask[] }>(
			accountName, 'GET',
			`/agents/automations/${encodeURIComponent(id)}/tasks?per_page=50&page=1&sort=created_at&direction=desc&is_archived=false`, token,
		);
		if (!Array.isArray(response.data?.tasks)) {
			throw invalidResponse();
		}
		for (const task of response.data.tasks) {
			validateTask(task, id);
		}
		return response.data.tasks;
	}

	async getTask(accountName: string, id: string, automationId: string, token: CancellationToken): Promise<ICloudAutomationTask> {
		const response = await this.request<ICloudAutomationTask>(accountName, 'GET', `/agents/tasks/${encodeURIComponent(id)}`, token);
		const task = response.data;
		validateTask(task, automationId);
		if (task.id !== id) {
			throw invalidResponse();
		}
		return task;
	}

	async stopTask(accountName: string, id: string, token: CancellationToken): Promise<void> {
		await this.mutate(token, async () => {
			await this.request(accountName, 'POST', `/agents/tasks/${encodeURIComponent(id)}/steer`, token, { type: 'abort' });
		});
	}

	private request<T>(accountName: string, method: string, path: string, token: CancellationToken, data?: object): Promise<IGitHubApiResponse<T>> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return this.client.requestCopilot<T>(method, path, 'cloudAutomations.request', {
			accountName, token, data, createAuthenticationSession: false, timeout: 30_000,
			...(method === 'PATCH' ? { contentType: 'application/merge-patch+json' } : {}),
		});
	}

	private async mutate<T>(token: CancellationToken, operation: () => Promise<T>): Promise<T> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		try {
			return await operation();
		} catch (error) {
			if (error instanceof GitHubAuthenticationError || (error instanceof GitHubApiError && error.statusCode >= 400 && error.statusCode < 500)) {
				throw error;
			}
			throw new AutomationMutationUncertainError(error);
		}
	}
}

function repositoryPath(repository: ICloudAutomationRepository): string {
	return `${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
}

function repositoryAutomationsPath(repository: ICloudAutomationRepository): string {
	return `/agents/repos/${repositoryPath(repository)}/automations`;
}

function hasNextPage(link: string | undefined): boolean {
	return link !== undefined && /rel="?next"?/.test(link);
}

function invalidResponse(): Error {
	return new Error(localize('cloudAutomations.invalidResponse', "GitHub returned an invalid cloud automation response. Refresh the catalogue before trying again."));
}

function validateDefinition(definition: ICloudAutomationSummary | undefined, repository: ICloudAutomationRepository, id?: string): asserts definition is ICloudAutomationDefinition {
	if (definition === undefined || typeof definition.id !== 'string' || definition.id.length === 0
		|| typeof definition.name !== 'string' || typeof definition.prompt !== 'string'
		|| typeof definition.created_at !== 'string' || typeof definition.updated_at !== 'string'
		|| !Number.isFinite(Date.parse(definition.created_at)) || !Number.isFinite(Date.parse(definition.updated_at))
		|| (id !== undefined && definition.id !== id)) {
		throw invalidResponse();
	}
	if (definition.repository !== undefined && definition.repository !== null
		&& (typeof definition.repository.owner !== 'string' || typeof definition.repository.name !== 'string'
			|| definition.repository.owner.toLowerCase() !== repository.owner.toLowerCase() || definition.repository.name.toLowerCase() !== repository.name.toLowerCase())) {
		throw invalidResponse();
	}
	if ((definition.tools !== undefined && definition.tools !== null && !isStringArray(definition.tools))
		|| (definition.model !== undefined && definition.model !== null && typeof definition.model !== 'string')
		|| (definition.reasoning_effort !== undefined && definition.reasoning_effort !== null && typeof definition.reasoning_effort !== 'string')
		|| (definition.disabled !== undefined && typeof definition.disabled !== 'boolean')) {
		throw invalidResponse();
	}
	if (definition.triggers !== undefined && definition.triggers !== null) {
		if (typeof definition.triggers !== 'object' || Array.isArray(definition.triggers)
			|| Object.values(definition.triggers).some(trigger => trigger === null || typeof trigger !== 'object' || !isStringArray(trigger.types))) {
			throw invalidResponse();
		}
	}
}

function validateTask(task: ICloudAutomationTask | undefined, automationId: string): asserts task is ICloudAutomationTask {
	if (task === undefined || typeof task.id !== 'string' || task.id.length === 0 || typeof task.state !== 'string'
		|| typeof task.created_at !== 'string' || !Number.isFinite(Date.parse(task.created_at))
		|| (task.automation_id !== undefined && task.automation_id !== automationId)) {
		throw invalidResponse();
	}
}
