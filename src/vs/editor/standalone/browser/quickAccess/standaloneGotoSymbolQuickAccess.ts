/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractGotoSymbolQuickAccessProvider } from 'vs/editor/contrib/quickAccess/gotoSymbolQuickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from 'vs/platform/quickinput/common/quickAccess';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { withNullAsUndefined } from 'vs/base/common/types';
import { QuickOutlineNLS } from 'vs/editor/common/standaloneStrings';
import { Event } from 'vs/base/common/event';

export class StandaloneGotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	readonly onDidActiveTextEditorControlChange = Event.None;

	constructor(@ICodeEditorService private readonly editorService: ICodeEditorService) {
		super();
	}

	get activeTextEditorControl() {
		return withNullAsUndefined(this.editorService.getFocusedCodeEditor());
	}
}

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	helpEntries: [
		{ description: QuickOutlineNLS.quickOutlineActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, needsEditor: true },
		{ description: QuickOutlineNLS.quickOutlineByCategoryActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY, needsEditor: true }
	]
});
