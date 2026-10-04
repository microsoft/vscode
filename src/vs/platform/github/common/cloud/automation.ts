/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isStringArray } from '../../../../base/common/types.js';
import { GitHubRepositoryRef } from '../githubQueryService.js';
import { booleanProperty, optionalObjectProperty, requiredString } from '../githubResponse.js';
import { GitHubRequestError } from '../githubTypes.js';
import { GitHubCloudApi, GitHubCloudList, GitHubCloudListOptions, GitHubCloudRequest, cloudNullableString, cloudObject, cloudOptionalBoolean, cloudPagination, cloudPathSegment, cloudRepositoryPath, cloudStatus, cloudTimestamp, collectCloudPages } from './cloudApi.js';
import { GitHubCloudTask, IGitHubCloudTasks } from './cloudTasks.js';

/** Event types and additional parameters for an automation trigger. */
export interface GitHubAutomationTrigger {
	readonly types: readonly string[];
	readonly [key: string]: string | number | boolean | null | readonly string[];
}

/** Repository automation definition returned by the cloud API. */
export interface GitHubAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly created_at: string;
	readonly updated_at: string;
	readonly disabled?: boolean;
	readonly disabled_state?: { readonly reason: string } | null;
	readonly repository?: { readonly owner: string; readonly name: string } | null;
	readonly triggers?: Readonly<Record<string, GitHubAutomationTrigger>> | null;
	readonly tools?: readonly string[] | null;
	readonly model?: string | null;
	readonly reasoning_effort?: string | null;
}

/** Editable automation fields sent in a merge-patch update. */
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

/** Automation creation payload requiring a name and prompt. */
export interface GitHubAutomationCreate extends GitHubAutomationUpdate {
	readonly name: string;
	readonly prompt: string;
}

/** Pagination and optional ownership filtering for repository automations. */
export interface GitHubAutomationListOptions extends GitHubCloudListOptions {
	readonly ownership?: 'user';
}

/** Repository automation operations and access to their cloud task run history. */
export interface IGitHubAutomations {
	isPrivateRepository(repository: GitHubRepositoryRef, signal: AbortSignal): Promise<boolean>;
	list(repository: GitHubRepositoryRef, signal: AbortSignal, options?: GitHubAutomationListOptions): Promise<GitHubCloudList<GitHubAutomation>>;
	get(repository: GitHubRepositoryRef, id: string, signal: AbortSignal): Promise<GitHubAutomation>;
	create(repository: GitHubRepositoryRef, value: GitHubAutomationCreate, signal: AbortSignal): Promise<GitHubAutomation>;
	update(repository: GitHubRepositoryRef, id: string, value: GitHubAutomationUpdate, signal: AbortSignal): Promise<GitHubAutomation>;
	delete(repository: GitHubRepositoryRef, id: string, signal: AbortSignal): Promise<void>;
	dispatch(repository: GitHubRepositoryRef, id: string, event: 'manual' | 'interval', signal: AbortSignal): Promise<void>;
	listRuns(id: string, signal: AbortSignal, options?: GitHubCloudListOptions): Promise<GitHubCloudList<GitHubCloudTask>>;
}

/** Implements automation operations through the shared cloud API and task domain. */
export class GitHubAutomations implements IGitHubAutomations {
	constructor(
		private readonly _api: GitHubCloudApi,
		private readonly _tasks: IGitHubCloudTasks,
	) { }

	isPrivateRepository(repository: GitHubRepositoryRef, signal: AbortSignal): Promise<boolean> {
		const path = `/repos/${cloudRepositoryPath(repository)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'GET', path, api: 'github' }, response => {
			cloudStatus(response, 200, 304);
			const isPrivate = booleanProperty(cloudObject(response.data), 'private');
			if (isPrivate === undefined) {
				throw new GitHubRequestError('GitHub repository privacy was missing', 'malformedResponse');
			}
			return isPrivate;
		}), repository);
	}

	list(repository: GitHubRepositoryRef, signal: AbortSignal, options: GitHubAutomationListOptions = {}): Promise<GitHubCloudList<GitHubAutomation>> {
		const path = `${repositoryPath(repository)}/v2`;
		const pagination = cloudPagination(options);
		return this._api.run('github.automations', signal, request => collectCloudPages(request, path, 'automations', pagination, { ownership: options.ownership }, value => {
			const summary = cloudObject(value);
			if (Reflect.get(summary, 'prompt') === undefined) {
				return getAutomation(request, repository, requiredString(summary, 'id'));
			}
			return parseAutomation(value, repository);
		}), repository);
	}

	get(repository: GitHubRepositoryRef, id: string, signal: AbortSignal): Promise<GitHubAutomation> {
		cloudRepositoryPath(repository);
		cloudPathSegment(id);
		return this._api.run('github.automations', signal, request => getAutomation(request, repository, id), repository);
	}

	create(repository: GitHubRepositoryRef, value: GitHubAutomationCreate, signal: AbortSignal): Promise<GitHubAutomation> {
		const path = repositoryPath(repository);
		return this._api.run('github.automations', signal, request => request({ method: 'POST', path, body: value }, response => {
			cloudStatus(response, 200, 201);
			return parseAutomation(response.data, repository);
		}), repository);
	}

	update(repository: GitHubRepositoryRef, id: string, value: GitHubAutomationUpdate, signal: AbortSignal): Promise<GitHubAutomation> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'PATCH', path, body: value, contentType: 'application/merge-patch+json' }, response => {
			cloudStatus(response, 200);
			return parseAutomation(response.data, repository, id);
		}), repository);
	}

	delete(repository: GitHubRepositoryRef, id: string, signal: AbortSignal): Promise<void> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}`;
		return this._api.run('github.automations', signal, request => request({ method: 'DELETE', path, responseBody: 'none' }, response => cloudStatus(response, 200, 204)), repository);
	}

	dispatch(repository: GitHubRepositoryRef, id: string, event: 'manual' | 'interval', signal: AbortSignal): Promise<void> {
		const path = `${repositoryPath(repository)}/${cloudPathSegment(id)}/tasks`;
		return this._api.run('github.automations', signal, request => request({ method: 'POST', path, body: { event }, responseBody: 'none' }, response => cloudStatus(response, 202)), repository);
	}

	listRuns(id: string, signal: AbortSignal, options?: GitHubCloudListOptions): Promise<GitHubCloudList<GitHubCloudTask>> {
		return this._tasks.listForAutomation(id, signal, options);
	}
}

function repositoryPath(repository: GitHubRepositoryRef): string {
	return `/repos/${cloudRepositoryPath(repository)}/automations`;
}

function getAutomation(request: GitHubCloudRequest, repository: GitHubRepositoryRef, id: string): Promise<GitHubAutomation> {
	return request({ method: 'GET', path: `/automations/${cloudPathSegment(id)}` }, response => {
		cloudStatus(response, 200, 304);
		return parseAutomation(response.data, repository, id);
	});
}

function parseAutomation(value: unknown, repository: GitHubRepositoryRef, id?: string): GitHubAutomation {
	validateAutomation(value);
	if (id !== undefined && value.id !== id
		|| value.repository && (value.repository.owner.toLowerCase() !== repository.owner.toLowerCase() || value.repository.name.toLowerCase() !== repository.repo.toLowerCase())) {
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
