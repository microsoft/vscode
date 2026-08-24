/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';

class IgnoredFileProvider implements vscode.LanguageModelIgnoredFileProvider {
	constructor(
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
	) { }

	provideFileIgnored(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<boolean> {
		return this._ignoreService.isCopilotIgnored(uri);
	}
}

export class IgnoredFileProviderContribution extends Disposable implements IExtensionContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(vscode.lm.registerIgnoredFileProvider(this.instantiationService.createInstance(IgnoredFileProvider)));
	}
}
