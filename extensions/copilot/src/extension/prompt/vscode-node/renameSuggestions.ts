/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { IExtensionContribution } from '../../common/contributions';
import { RenameSuggestionsProvider } from '../../renameSuggestions/node/renameSuggestionsProvider';

export class RenameSuggestionsContrib extends Disposable implements IExtensionContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		if ('registerNewSymbolNamesProvider' in vscode.languages) {
			this._register(vscode.languages.registerNewSymbolNamesProvider({ language: '*' }, this.instantiationService.createInstance(RenameSuggestionsProvider)));
		}
	}
}
