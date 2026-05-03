/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';

export const IAgentHostSessionWorkingDirectoryResolver = createDecorator<IAgentHostSessionWorkingDirectoryResolver>('agentHostSessionWorkingDirectoryResolver');

export interface IAgentHostSessionWorkingDirectoryResolver {
	readonly _serviceBrand: undefined;
	registerResolver(sessionType: string, resolver: (sessionResource: URI) => URI | undefined, isNewSession?: (sessionResource: URI) => boolean): IDisposable;
	resolve(sessionResource: URI): URI | undefined;
	isNewSession(sessionResource: URI): boolean;
	setSessionWorkingDirectory(sessionResource: URI, cwd: URI): void;
	getSessionWorkingDirectory(sessionResource: URI): URI | undefined;
	clearSessionWorkingDirectory(sessionResource: URI): void;
}

class AgentHostSessionWorkingDirectoryResolver implements IAgentHostSessionWorkingDirectoryResolver {
	declare readonly _serviceBrand: undefined;

	private readonly _resolvers = new Map<string, { readonly resolve: (sessionResource: URI) => URI | undefined; readonly isNewSession?: (sessionResource: URI) => boolean }>();
	private readonly _sessionOverrides = new ResourceMap<URI>();

	registerResolver(sessionType: string, resolver: (sessionResource: URI) => URI | undefined, isNewSession?: (sessionResource: URI) => boolean): IDisposable {
		const entry = { resolve: resolver, isNewSession };
		this._resolvers.set(sessionType, entry);
		return toDisposable(() => {
			if (this._resolvers.get(sessionType) === entry) {
				this._resolvers.delete(sessionType);
			}
		});
	}

	resolve(sessionResource: URI): URI | undefined {
		return this._sessionOverrides.get(sessionResource)
			?? this._resolvers.get(sessionResource.scheme)?.resolve(sessionResource);
	}

	isNewSession(sessionResource: URI): boolean {
		return this._resolvers.get(sessionResource.scheme)?.isNewSession?.(sessionResource) ?? false;
	}

	setSessionWorkingDirectory(sessionResource: URI, cwd: URI): void {
		this._sessionOverrides.set(sessionResource, cwd);
	}

	getSessionWorkingDirectory(sessionResource: URI): URI | undefined {
		return this._sessionOverrides.get(sessionResource);
	}

	clearSessionWorkingDirectory(sessionResource: URI): void {
		this._sessionOverrides.delete(sessionResource);
	}
}

registerSingleton(IAgentHostSessionWorkingDirectoryResolver, AgentHostSessionWorkingDirectoryResolver, InstantiationType.Delayed);
