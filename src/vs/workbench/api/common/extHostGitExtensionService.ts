/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostExtensionService } from './extHostExtensionService.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostGitExtensionShape, GitBranchDto, GitRefDto, GitRefQueryDto, GitRefTypeDto, GitRepositoryStateDto, GitUpstreamRefDto, MainContext, MainThreadGitExtensionShape } from './extHost.protocol.js';
import { ResourceMap } from '../../../base/common/map.js';

const GIT_EXTENSION_ID = 'vscode.git';

function toGitRefTypeDto(type: GitRefType): GitRefTypeDto {
	switch (type) {
		case GitRefType.Head: return GitRefTypeDto.Head;
		case GitRefType.RemoteHead: return GitRefTypeDto.RemoteHead;
		case GitRefType.Tag: return GitRefTypeDto.Tag;
		default: throw new Error(`Unknown GitRefType: ${type}`);
	}
}

function toGitBranchDto(branch: Branch): GitBranchDto {
	return {
		name: branch.name,
		commit: branch.commit,
		type: toGitRefTypeDto(branch.type),
		remote: branch.remote,
		upstream: branch.upstream ? toGitUpstreamRefDto(branch.upstream) : undefined,
		ahead: branch.ahead,
		behind: branch.behind,
	};
}

function toGitUpstreamRefDto(upstream: UpstreamRef): GitUpstreamRefDto {
	return {
		remote: upstream.remote,
		name: upstream.name,
		commit: upstream.commit,
	};
}

interface Repository {
	readonly rootUri: vscode.Uri;
	readonly state: RepositoryState;

	status(): Promise<void>;
	getRefs(query: GitRefQuery, token?: vscode.CancellationToken): Promise<GitRef[]>;
}

interface RepositoryState {
	readonly HEAD: Branch | undefined;
	readonly onDidChange: Event<void>;
}

interface Branch extends GitRef {
	readonly upstream?: UpstreamRef;
	readonly ahead?: number;
	readonly behind?: number;
}

interface UpstreamRef {
	readonly remote: string;
	readonly name: string;
	readonly commit?: string;
}

interface GitRef {
	type: GitRefType;
	name?: string;
	commit?: string;
	remote?: string;
}

const enum GitRefType {
	Head,
	RemoteHead,
	Tag
}

interface GitRefQuery {
	readonly contains?: string;
	readonly count?: number;
	readonly pattern?: string | string[];
	readonly sort?: 'alphabetically' | 'committerdate' | 'creatordate';
}

interface GitExtensionAPI {
	openRepository(root: vscode.Uri): Promise<Repository | null>;
}

interface GitExtension {
	getAPI(version: 1): GitExtensionAPI;
}

export interface IExtHostGitExtensionService extends ExtHostGitExtensionShape {
	readonly _serviceBrand: undefined;
}

export const IExtHostGitExtensionService = createDecorator<IExtHostGitExtensionService>('IExtHostGitExtensionService');

export class ExtHostGitExtensionService extends Disposable implements IExtHostGitExtensionService {
	declare readonly _serviceBrand: undefined;

	private static _handlePool: number = 0;

	private _gitApi: GitExtensionAPI | undefined;

	private readonly _proxy: MainThreadGitExtensionShape;

	private readonly _repositories = new Map<number, Repository>();
	private readonly _repositoryByUri = new ResourceMap<number>();

	private readonly _disposables = this._register(new DisposableStore());

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostExtensionService private readonly _extHostExtensionService: IExtHostExtensionService,
	) {
		super();

		this._proxy = extHostRpc.getProxy(MainContext.MainThreadGitExtension);
	}

	async $isGitExtensionAvailable(): Promise<boolean> {
		const registry = await this._extHostExtensionService.getExtensionRegistry();
		return !!registry.getExtensionDescription(GIT_EXTENSION_ID);
	}

	async $openRepository(uri: UriComponents): Promise<{ handle: number; rootUri: UriComponents; state: GitRepositoryStateDto } | undefined> {
		const api = await this._ensureGitApi();
		if (!api) {
			return undefined;
		}

		const repository = await api.openRepository(URI.revive(uri));
		if (!repository) {
			return undefined;
		}

		const existingHandle = this._repositoryByUri.get(repository.rootUri);
		if (existingHandle !== undefined) {
			return {
				handle: existingHandle,
				rootUri: repository.rootUri,
				state: {
					HEAD: repository.state.HEAD ? toGitBranchDto(repository.state.HEAD) : undefined
				}
			};
		}

		let repositoryState = repository.state;
		if (repositoryState.HEAD === undefined) {
			// Opening the repository does not wait for the repository state to be
			// initialized so we need to wait for the first change event to ensure
			// that the repository state is fully loaded before we return it to the
			// main thread.
			await Event.toPromise(repositoryState.onDidChange, this._disposables);
			repositoryState = repository.state;
		}

		// Store the repository and its handle in the maps
		const handle = ExtHostGitExtensionService._handlePool++;

		this._repositories.set(handle, repository);
		this._repositoryByUri.set(repository.rootUri, handle);

		// Subscribe to repository state changes
		this._disposables.add(repository.state.onDidChange(() => {
			this._proxy.$onDidChangeRepository(handle);
		}));

		return {
			handle,
			rootUri: repository.rootUri,
			state: {
				HEAD: repository.state.HEAD
					? toGitBranchDto(repository.state.HEAD)
					: undefined
			}
		};
	}

	async $getRefs(handle: number, query: GitRefQueryDto, token?: vscode.CancellationToken): Promise<GitRefDto[]> {
		const repository = this._repositories.get(handle);
		if (!repository) {
			return [];
		}

		try {
			const refs = await repository.getRefs(query, token);
			const result: (GitRefDto | undefined)[] = refs.map(ref => {
				if (!ref.name || !ref.commit) {
					return undefined;
				}

				const id = ref.type === GitRefType.Head
					? `refs/heads/${ref.name}`
					: ref.type === GitRefType.RemoteHead
						? `refs/remotes/${ref.remote}/${ref.name}`
						: `refs/tags/${ref.name}`;

				return {
					id,
					name: ref.name,
					type: toGitRefTypeDto(ref.type),
					revision: ref.commit
				} satisfies GitRefDto;
			});

			return result.filter(ref => !!ref);
		} catch {
			return [];
		}
	}

	async $getRepositoryState(handle: number): Promise<GitRepositoryStateDto | undefined> {
		const repository = this._repositories.get(handle);
		if (!repository) {
			return undefined;
		}

		const state = repository.state;
		return { HEAD: state.HEAD ? toGitBranchDto(state.HEAD) : undefined };
	}

	private async _ensureGitApi(): Promise<GitExtensionAPI | undefined> {
		if (this._gitApi) {
			return this._gitApi;
		}

		try {
			await this._extHostExtensionService.activateByIdWithErrors(
				new ExtensionIdentifier(GIT_EXTENSION_ID),
				{ startup: false, extensionId: new ExtensionIdentifier(GIT_EXTENSION_ID), activationEvent: 'api' }
			);

			const exports = this._extHostExtensionService.getExtensionExports(new ExtensionIdentifier(GIT_EXTENSION_ID));
			if (!!exports && typeof (exports as GitExtension).getAPI === 'function') {
				this._gitApi = (exports as GitExtension).getAPI(1);
			}
		} catch {
			// Git extension not available
		}

		return this._gitApi;
	}

	override dispose(): void {
		this._disposables.dispose();
		super.dispose();
	}
}
