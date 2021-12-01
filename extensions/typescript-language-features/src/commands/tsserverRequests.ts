/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TypeScriptRequests } from '../typescriptService';
import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { nulToken } from '../utils/cancellation';
import { Lazy } from '../utils/lazy';
import { Command } from './commandManager';

export class TSServerRequestCommand implements Command {
	public readonly id = 'typescript.tsserverRequest';

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>
	) { }

	public execute(requestID: keyof TypeScriptRequests, args?: any, config?: any) {
		// A cancellation token cannot be passed through the command infrastructure
		const token = nulToken;
		try {
			return this.lazyClientHost.value.serviceClient.execute(requestID, args, token, config);
		} catch (error) {
			return { error };
		}
	}
}

