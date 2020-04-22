/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import TypeScriptServiceClientHost from '../typeScriptServiceClientHost';
import { Command } from '../utils/commandManager';
import { Lazy } from '../utils/lazy';

export class SelectTypeScriptVersionCommand implements Command {
	public readonly id = 'typescript.selectTypeScriptVersion';

	public constructor(
		private readonly lazyClientHost: Lazy<TypeScriptServiceClientHost>
	) { }

	public execute() {
		this.lazyClientHost.value.serviceClient.showVersionPicker();
	}
}
