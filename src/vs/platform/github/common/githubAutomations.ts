/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isStringArray } from '../../../base/common/types.js';
import { GitHubCloudApi, GitHubCloudList, GitHubCloudListOptions, GitHubCloudRepository, GitHubCloudRequest, cloudNullableString, cloudObject, cloudOptionalBoolean, cloudPagination, cloudPathSegment, cloudRepositoryPath, cloudStatus, cloudTimestamp, collectCloudPages } from './githubCloudApi.js';
import { GitHubCloudTask, IGitHubCloudTasks } from './githubCloudTasks.js';
import { booleanProperty, optionalObjectProperty, requiredString } from './githubResponse.js';
import { GitHubRequestError } from './githubTypes.js';

export interface GitHubAutomationTrigger {
	readonly types: readonly string[];
	readonly [key: string]: string | number | boolean | null | readonly string[];
}

export interface GitHubAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly created_at: string;
	readonly updated_at: string;
	readonly disabled?: boolean;
	readonly disabled_state?: { readonly reason: string } | null;
	readonly repository?: GitHubCloudRepository | null;
	readonly triggers?: Readonly<Record<string, GitHubAutomationTrigger>> | null;
	readonly tools?: readonly string[] | null;
	readonly model?: string | null;
	readonly reasoning_effort?: string | null;
}

export interface GitHubAutomationUpdate {
	readonly name?: string;
	readonly prompt?: string;
	readonly description?: string;
	readonly disabled?: boolean;
	readonly triggers?: Readonly<Record<string, GitHubAutomationTrigger>>;
	readonly tools?: readonly string[];
	readonly model?: string;
	readonly reasoning_effort?: string;
	readonly require_actor_write_permission?: boolean;
}

export interface GitHubAutomationCreate extends GitHubAutomationUpdate {
	readonly name: string;
	readonly prompt: string;
}

export interface GitHubAutomationListOptions extends GitHubCloudListOptions {
	readonly ownership?: 'user';
}

export interface IGitHubAutomations {
	isPrivateRepository(repository: GitHubCloudRepository, signal: AbortSignal): Promise<boolean>;
	list(repository: GitHubCloudRepository, signal: AbortSignal, options?: GitHubAutomationListOptions): Promise<GitHubCloudList<GitHubAutomation>>;
	get(repository: GitHubCloudRepository, id: string, signal: AbortSignal): Promise<GitHubAutomation>;
	create(repository: GitHubCloudRepository, value: GitHubAutomationCreate, signal: AbortSignal): Promise<GitHubAutomation>;
	update(repository: GitHubCloudRepository, id: string, value: GitHubAutomationUpdate, signal: AbortSignal): Promise<GitHubAutomation>;
	delete(repository: GitHubCloudRepository, id: string, signal: AbortSignal): Promise<void>;
	dispatch(repository: GitHubCloudRepository, id: string, event: 'manual' | 'interval', signal: AbortSignal): Promise<void>;
	listRuns(id: string, signal: AbortSignal, options?: GitHubCloudListOptions): Promise<GitHubCloudList<GitHubCloudTask>>;
}

export class GitHubAutomations implements IGitHubAutomations {
	constructor(
		private readonly _api: GitHubCloudApi,
		private readonly _tasks: IGitHubCloudTasks,
	) { }

	isPrivateRepository(repository: GitHubCloudRepository, signal: AbortSignal): Promise<boolean> {
		const path = `/repos/${cloudRepositoryPath(repository)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'GET', path, api: 'github' }, response => {
			cloudStatus(response, 200, 304);
			const isPrivate = booleanProperty(cloudObject(response.data), 'private');
			if (isPrivate === undefined) {
				throw new GitHubRequestError('GitHub repository privacy was missing', 'malformedResponse');
			}
			return isPrivate;
		}));
	}

	list(repository: GitHubCloudRepository, signal: AbortSignal, options: GitHubAutomationListOptions = {}): Promise<GitHubCloudList<GitHubAutomation>> {
		const path = `${repositoryPath(repository)}/v2`;
		const pagination = cloudPagination(options);
		return this._api.run('github.automations', signal, request => collectCloudPages(request, path, 'automations', pagination, { ownership: options.ownership }, value => {
			const summary = cloudObject(value);
			if (Reflect.get(summary, 'prompt') === undefined) {
				return getAutomation(request, repository, requiredString(summary, 'id'));
			}
			return parseAutomation(value, repository);
		}));
	}

	get(repository: GitHubCloudRepository, id: string, signal: AbortSignal): Promise<GitHubAutomation> {
		cloudRepositoryPath(repository);
		cloudPathSegment(id);
		return this._api.run('github.automations', signal, request => getAutomation(request, repository, id));
	}

	create(repository: GitHubCloudRepository, value: GitHubAutomationCreate, signal: AbortSignal): Promise<GitHubAutomation> {
		const path = repositoryPath(repository);
		return this._api.run('github.automations', signal, request => request({ method: 'POST', path, body: value }, response => {
			cloudStatus(response, 200, 201);
			return parseAutomation(response.data, repository);
		}));
	}

	update(repository: GitHubCloudRepository, id: string, value: GitHubAutomationUpdate, signal: AbortSignal): Promise<GitHubAutomation> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'PATCH', path, body: value, contentType: 'application/merge-patch+json' }, response => {
			cloudStatus(response, 200);
			return parseAutomation(response.data, repository, id);
		}));
	}

	delete(repository: GitHubCloudRepository, id: string, signal: AbortSignal): Promise<void> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'DELETE', path, responseBody: 'none' }, response => cloudStatus(response, 200, 204)));
	}

	dispatch(repository: GitHubCloudRepository, id: string, event: 'manual' | 'interval', signal: AbortSignal): Promise<void> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}/tasks`;
		return this._api.run('github.automations', signal, request => request({ method: 'POST', path, body: { event }, responseBody: 'none' }, response => cloudStatus(response, 202)));
	}

	listRuns(id: string, signal: AbortSignal, options?: GitHubCloudListOptions): Promise<GitHubCloudList<GitHubCloudTask>> {
		return this._tasks.listForAutomation(id, signal, options);
	}
}

function repositoryPath(repository: GitHubCloudRepository): string {
	return `/repos/${cloudRepositoryPath(repository)}/automations`;
}

function getAutomation(request: GitHubCloudRequest, repository: GitHubCloudRepository, id: string): Promise<GitHubAutomation> {
	return request({ method: 'GET', path: `/automations/${cloudPathSegment(id)}` }, response => {
		cloudStatus(response, 200, 304);
		return parseAutomation(response.data, repository, id);
	});
}

function parseAutomation(value: unknown, repository: GitHubCloudRepository, id?: string): GitHubAutomation {
	validateAutomation(value);
	if (id !== undefined && value.id !== id
		|| value.repository && (value.repository.owner.toLowerCase() !== repository.owner.toLowerCase() || value.repository.name.toLowerCase() !== repository.name.toLowerCase())) {
		throw new GitHubRequestError('GitHub cloud automation identity did not match the request', 'malformedResponse');
	}
	return value;
}

function validateAutomation(value: unknown): asserts value is GitHubAutomation {
	const automation = cloudObject(value);
	if (!requiredString(automation, 'id')) {
		throw new GitHubRequestError('GitHub cloud automation identity was missing', 'malformedResponse');
	}
	requiredString(automation, 'name');
	requiredString(automation, 'prompt');
	cloudTimestamp(requiredString(automation, 'created_at'));
	cloudTimestamp(requiredString(automation, 'updated_at'));
	cloudOptionalBoolean(automation, 'disabled');
	cloudNullableString(automation, 'model');
	cloudNullableString(automation, 'reasoning_effort');
	const disabledState = optionalObjectProperty(automation, 'disabled_state');
	if (disabledState) {
		requiredString(disabledState, 'reason');
	}
	const repository = optionalObjectProperty(automation, 'repository');
	if (repository) {
		requiredString(repository, 'owner');
		requiredString(repository, 'name');
	}
	const tools: unknown = Reflect.get(automation, 'tools');
	if (tools !== undefined && tools !== null && !isStringArray(tools)) {
		throw new GitHubRequestError('GitHub cloud automation tools were malformed', 'malformedResponse');
	}
	const triggers = optionalObjectProperty(automation, 'triggers');
	if (triggers) {
		for (const value of Object.values(triggers)) {
			const trigger = cloudObject(value);
			if (!isStringArray(Reflect.get(trigger, 'types'))) {
				throw new GitHubRequestError('GitHub cloud automation trigger types were malformed', 'malformedResponse');
			}
			for (const property of Object.values(trigger)) {
				if (property !== null && typeof property !== 'string' && typeof property !== 'boolean'
					&& !(typeof property === 'number' && Number.isFinite(property)) && !isStringArray(property)) {
					throw new GitHubRequestError('GitHub cloud automation trigger was malformed', 'malformedResponse');
				}
			}
		}
	}
}
