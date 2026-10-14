/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, type UriComponents } from '../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { AhpErrorCodes, ProtocolError, type ContentEncoding, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWriteParams, type ResourceWriteResult } from '../common/state/sessionProtocol.js';
import { FileSystemResources } from './resourceProviders/fileSystemResources.js';

export const IAgentHostResourceProviders = createDecorator<IAgentHostResourceProviders>('agentHostResourceProviders');

/** Implements supported resource operations for one URI scheme. */
export interface IAgentHostResourceProvider {
	read?(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult>;
	list?(uri: URI): Promise<ResourceListResult>;
	write?(params: ResourceWriteParams): Promise<ResourceWriteResult>;
	copy?(params: ResourceCopyParams): Promise<ResourceCopyResult>;
	delete?(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;
	move?(params: ResourceMoveParams): Promise<ResourceMoveResult>;
	resolve?(params: ResourceResolveParams): Promise<ResourceResolveResult>;
	mkdir?(params: ResourceMkdirParams): Promise<ResourceMkdirResult>;
}

/** Routes resource operations to scheme providers, with the filesystem as the fallback. */
export interface IAgentHostResourceProviders extends Required<IAgentHostResourceProvider> {
	readonly _serviceBrand: undefined;

	/** Registers a provider, rejecting schemes that already have one. Disposal unregisters it. */
	registerProvider(scheme: string, provider: IAgentHostResourceProvider): IDisposable;
}

/** Owns scheme-based resource routing and the filesystem fallback. */
export class AgentHostResourceProviders extends Disposable implements IAgentHostResourceProviders {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, IAgentHostResourceProvider>();
	private readonly _fileSystem: FileSystemResources;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._fileSystem = this._register(instantiationService.createInstance(FileSystemResources));
	}

	registerProvider(scheme: string, provider: IAgentHostResourceProvider): IDisposable {
		if (this._providers.has(scheme)) {
			throw new Error(`Resource provider already registered for scheme: ${scheme}`);
		}
		this._providers.set(scheme, provider);
		return toDisposable(() => this._providers.delete(scheme));
	}

	async read(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult> {
		return this._getProvider(uri, 'read').read(uri, encoding);
	}

	async list(uri: URI): Promise<ResourceListResult> {
		return this._getProvider(uri, 'list').list(uri);
	}

	async write(params: ResourceWriteParams): Promise<ResourceWriteResult> {
		return this._getProvider(params.uri, 'write').write(params);
	}

	async copy(params: ResourceCopyParams): Promise<ResourceCopyResult> {
		return this._getProvider(params.source, 'copy').copy(params);
	}

	async delete(params: ResourceDeleteParams): Promise<ResourceDeleteResult> {
		return this._getProvider(params.uri, 'delete').delete(params);
	}

	async move(params: ResourceMoveParams): Promise<ResourceMoveResult> {
		return this._getProvider(params.source, 'move').move(params);
	}

	async resolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
		return this._getProvider(params.uri, 'resolve').resolve(params);
	}

	async mkdir(params: ResourceMkdirParams): Promise<ResourceMkdirResult> {
		return this._getProvider(params.uri, 'mkdir').mkdir(params);
	}

	private _getProvider<K extends keyof IAgentHostResourceProvider>(uri: URI | string | UriComponents, operation: K): Required<Pick<IAgentHostResourceProvider, K>> {
		const resource = typeof uri === 'string' ? URI.parse(uri) : URI.revive(uri);
		const provider = this._providers.get(resource.scheme) ?? this._fileSystem;
		if (!provider[operation]) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Resource operation '${operation}' is not supported for: ${resource.toString()}`);
		}
		return provider as Required<Pick<IAgentHostResourceProvider, K>>;
	}

	override dispose(): void {
		this._providers.clear();
		super.dispose();
	}
}
