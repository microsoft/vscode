/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { posix } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { supportsAgentHostProjectManagement } from '../../../../../platform/agentHost/common/meta/agentHostProjectMeta.js';
import { RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { getGitHubRepositoryId } from '../../../../common/gitHubRepository.js';

export interface ICloudSandboxProject {
	readonly id: string;
	readonly path: string;
	readonly git: boolean;
	readonly status: 'cloning' | 'ready' | 'failed';
	readonly remoteUrl?: string;
	readonly progress?: number;
	readonly error?: string;
}

export interface ICloudSandboxCloneProjectOptions {
	readonly url: string;
	readonly depth: 1;
}

/** Validated project operations for one sandbox connection. */
export interface ICloudSandboxProjectsClient {
	readonly onDidChange: Event<void>;
	readonly onDidError: Event<Error>;
	isAvailable(): boolean;
	getProjects(): readonly ICloudSandboxProject[];
	cloneProject(options: ICloudSandboxCloneProjectOptions, token: CancellationToken): Promise<ICloudSandboxProject>;
	toResourceUri(path: string): URI;
}

export function invalidCloudSandboxProject(): Error {
	return new Error(localize('cloudSandbox.invalidProject', "The remote host returned invalid repository information."));
}

function readProject(value: unknown): ICloudSandboxProject {
	if (typeof value !== 'object' || value === null) {
		throw invalidCloudSandboxProject();
	}
	const candidate = value as Partial<ICloudSandboxProject>;
	const { id, path, git, status, remoteUrl, progress, error } = candidate;
	if (typeof id !== 'string' || !id
		|| typeof path !== 'string' || !posix.isAbsolute(path)
		|| typeof git !== 'boolean'
		|| (status !== 'cloning' && status !== 'ready' && status !== 'failed')
		|| (remoteUrl !== undefined && typeof remoteUrl !== 'string')
		|| (progress !== undefined && (typeof progress !== 'number' || !Number.isInteger(progress) || progress < 0 || progress > 100))
		|| (error !== undefined && typeof error !== 'string')) {
		throw invalidCloudSandboxProject();
	}
	return { id, path, git, status, remoteUrl, progress, error };
}

/** Owns the sandbox project's wire contract and validation, scoped to the transport lifetime. */
export class CloudSandboxProjectsClient extends Disposable implements ICloudSandboxProjectsClient {
	private readonly _lifetime = this._register(new CancellationTokenSource());
	private readonly _onDidClose = this._register(new Emitter<Error>());
	readonly onDidChange: Event<void>;
	readonly onDidError: Event<Error>;

	constructor(private readonly _connection: AgentHostProtocolClient) {
		super();
		this.onDidChange = Event.map(_connection.rootState.onDidChange, () => undefined);
		this.onDidError = Event.any(_connection.rootState.onDidError ?? Event.None, this._onDidClose.event);
	}

	isAvailable(): boolean {
		return supportsAgentHostProjectManagement(this._readRoot());
	}

	getProjects(): readonly ICloudSandboxProject[] {
		const namespace = this._readRoot().config?.values.copilot;
		const projects = typeof namespace === 'object' && namespace !== null
			? (namespace as { projects?: unknown }).projects
			: undefined;
		if (!Array.isArray(projects)) {
			throw invalidCloudSandboxProject();
		}
		return projects.map(readProject);
	}

	async cloneProject(options: ICloudSandboxCloneProjectOptions, token: CancellationToken): Promise<ICloudSandboxProject> {
		this._throwIfClosed();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!this.isAvailable()) {
			throw new Error(localize('cloudSandbox.projectRequestsUnsupported', "This connection cannot prepare repositories on the remote host."));
		}
		const repository = getGitHubRepositoryId(options.url);
		if (!repository) {
			throw new Error(localize('cloudSandbox.invalidRepository', "Choose a GitHub repository before starting this session."));
		}
		const store = new DisposableStore();
		const cts = store.add(new CancellationTokenSource(token));
		store.add(this._lifetime.token.onCancellationRequested(() => cts.cancel()));
		try {
			const response = await raceCancellationError(this._connection.requestHostExtension('extensions/cloneProject', {
				url: options.url,
				depth: options.depth,
			}), cts.token);
			this._throwIfClosed();
			if (typeof response !== 'object' || response === null) {
				throw invalidCloudSandboxProject();
			}
			const project = readProject((response as { project?: unknown }).project);
			if (!project.remoteUrl || getGitHubRepositoryId(project.remoteUrl)?.toLowerCase() !== repository.toLowerCase()) {
				throw invalidCloudSandboxProject();
			}
			return project;
		} finally {
			store.dispose();
		}
	}

	toResourceUri(path: string): URI {
		this._throwIfClosed();
		return this._connection.resourceUris.fromAgentHost(URI.file(path));
	}

	private _readRoot(): RootState {
		this._throwIfClosed();
		const state = this._connection.rootState.value;
		if (state instanceof Error) {
			throw state;
		}
		if (!state) {
			throw new Error(localize('cloudSandbox.noProjectCatalogue', "Repository information is not available from the remote host."));
		}
		return state;
	}

	private _throwIfClosed(): void {
		if (this._lifetime.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		if (!this._store.isDisposed) {
			this._lifetime.cancel();
			this._onDidClose.fire(new CancellationError());
			super.dispose();
		}
	}
}
