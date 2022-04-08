/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import TypeScriptServiceClientHost from '../typescript-language-features/src/typeScriptServiceClientHost';
import { Lazy } from '../typescript-language-features/src/utils/lazy';
import { Command } from '../typescript-language-features/src/commands/commandManager';

export class RestartTsServerCommand implements Command
{
	public readonly id = 'typescript.restartTsServer';

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>
	) { }

	public execute()
	{
		this.lazyClientHost.value.serviceClient.restartTsServer(true);
	}
}
