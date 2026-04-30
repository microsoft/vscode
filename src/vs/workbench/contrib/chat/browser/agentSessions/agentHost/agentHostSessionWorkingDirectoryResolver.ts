/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';

export const IAgentHostSessionWorkingDirectoryResolver = createDecorator<IAgentHostSessionWorkingDirectoryResolver>('agentHostSessionWorkingDirectoryResolver');

export interface IAgentHostSessionWorkingDirectoryResolver {
	readonly _serviceBrand: undefined;
	registerResolver(sessionType: string, resolver: (sessionResource: URI) => URI | undefined): IDisposable;
	resolve(sessionResource: URI): URI | undefined;
}

class AgentHostSessionWorkingDirectoryResolver implements IAgentHostSessionWorkingDirectoryResolver {
	declare readonly _serviceBrand: undefined;

	private readonly _resolvers = new Map<string, (sessionResource: URI) => URI | undefined>();

	registerResolver(sessionType: string, resolver: (sessionResource: URI) => URI | undefined): IDisposable {
		this._resolvers.set(sessionType, resolver);
		return toDisposable(() => {
			if (this._resolvers.get(sessionType) === resolver) {
				this._resolvers.delete(sessionType);
			}
		});
	}

	resolve(sessionResource: URI): URI | undefined {
		return this._resolvers.get(sessionResource.scheme)?.(sessionResource);
	}
}

registerSingleton(IAgentHostSessionWorkingDirectoryResolver, AgentHostSessionWorkingDirectoryResolver, InstantiationType.Delayed);
