/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';

export const IAgentHostSessionWorkingDirectoryResolver = createDecorator<IAgentHostSessionWorkingDirectoryResolver>('agentHostSessionWorkingDirectoryResolver');

/**
 * A resolved working directory, or `null` when the session type has decided that
 * the host must choose the directory itself (for example a workspace-less remote
 * session), so no local fallback may be substituted.
 */
export type RequestedWorkingDirectory = URI | null | undefined;

export interface IAgentHostSessionWorkingDirectoryResolver {
	readonly _serviceBrand: undefined;
	registerResolver(sessionType: string, resolver: (sessionResource: URI) => RequestedWorkingDirectory, isNewSession?: (sessionResource: URI) => boolean): IDisposable;
	/** The working directory a session type resolved, if any. */
	resolve(sessionResource: URI): URI | undefined;
	/** Like {@link resolve}, but preserves an explicit `null` meaning the host chooses. */
	resolveRequested(sessionResource: URI): RequestedWorkingDirectory;
	isNewSession(sessionResource: URI): boolean;
}

class AgentHostSessionWorkingDirectoryResolver implements IAgentHostSessionWorkingDirectoryResolver {
	declare readonly _serviceBrand: undefined;

	private readonly _resolvers = new Map<string, { readonly resolve: (sessionResource: URI) => RequestedWorkingDirectory; readonly isNewSession?: (sessionResource: URI) => boolean }>();

	registerResolver(sessionType: string, resolver: (sessionResource: URI) => RequestedWorkingDirectory, isNewSession?: (sessionResource: URI) => boolean): IDisposable {
		const entry = { resolve: resolver, isNewSession };
		this._resolvers.set(sessionType, entry);
		return toDisposable(() => {
			if (this._resolvers.get(sessionType) === entry) {
				this._resolvers.delete(sessionType);
			}
		});
	}

	resolve(sessionResource: URI): URI | undefined {
		return this.resolveRequested(sessionResource) ?? undefined;
	}

	resolveRequested(sessionResource: URI): RequestedWorkingDirectory {
		return this._resolvers.get(sessionResource.scheme)?.resolve(sessionResource);
	}

	isNewSession(sessionResource: URI): boolean {
		return this._resolvers.get(sessionResource.scheme)?.isNewSession?.(sessionResource) ?? false;
	}
}

registerSingleton(IAgentHostSessionWorkingDirectoryResolver, AgentHostSessionWorkingDirectoryResolver, InstantiationType.Delayed);
