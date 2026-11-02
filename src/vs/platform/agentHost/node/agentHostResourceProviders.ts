/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, type UriComponents } from '../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IAgentHostResourceReadRange } from '../common/meta/agentHostResourceReadRangeMeta.js';
import { AhpErrorCodes, ContentEncoding, ProtocolError, type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult, type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult, type ResourceReadResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWriteParams, type ResourceWriteResult } from '../common/state/sessionProtocol.js';
import { FileSystemResources } from './resourceProviders/fileSystemResources.js';

export const IAgentHostResourceProviders = createDecorator<IAgentHostResourceProviders>('agentHostResourceProviders');

/** Implements supported resource operations for one URI scheme. */
export interface IAgentHostResourceProvider {
	read?(uri: URI, encoding: ContentEncoding): Promise<ResourceReadResult>;
	/** Reads only the bytes in {@link range}, as `base64`. Without it, ranged reads read the whole resource and slice it. */
	readRange?(uri: URI, range: IAgentHostResourceReadRange): Promise<ResourceReadResult>;
	list?(uri: URI): Promise<ResourceListResult>;
	write?(params: ResourceWriteParams): Promise<ResourceWriteResult>;
	copy?(params: ResourceCopyParams): Promise<ResourceCopyResult>;
	delete?(params: ResourceDeleteParams): Promise<ResourceDeleteResult>;
	move?(params: ResourceMoveParams): Promise<ResourceMoveResult>;
	resolve?(params: ResourceResolveParams): Promise<ResourceResolveResult>;
	mkdir?(params: ResourceMkdirParams): Promise<ResourceMkdirResult>;
}

/** Routes resource operations to scheme providers, with the filesystem as the fallback. */
export interface IAgentHostResourceProviders extends Required<Omit<IAgentHostResourceProvider, 'read' | 'readRange'>> {
	readonly _serviceBrand: undefined;

	/** Reads a resource, or only the bytes in {@link range} (then always as `base64`). */
	read(uri: URI, encoding: ContentEncoding, range?: IAgentHostResourceReadRange): Promise<ResourceReadResult>;

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

	async read(uri: URI, encoding: ContentEncoding, range?: IAgentHostResourceReadRange): Promise<ResourceReadResult> {
		if (!range) {
			return this._getProvider(uri, 'read').read(uri, encoding);
		}
		const provider = this._providers.get(uri.scheme) ?? this._fileSystem;
		if (provider.readRange) {
			return provider.readRange(uri, range);
		}
		// The provider only reads whole resources: send just the requested bytes.
		const result = await this._getProvider(uri, 'read').read(uri, ContentEncoding.Base64);
		const content = result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data) : VSBuffer.fromString(result.data);
		const start = Math.min(range.position, content.byteLength);
		const end = range.length === undefined ? content.byteLength : Math.min(start + range.length, content.byteLength);
		return { ...result, data: encodeBase64(content.slice(start, end)), encoding: ContentEncoding.Base64 };
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
