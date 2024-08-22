/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../base/browser/ui/codicons/codiconStyles'; // The codicon symbol styles are defined here and must be loaded
import '../../../contrib/symbolIcons/browser/symbolIcons'; // The codicon symbol colors are defined here and must be loaded to get colors
import { AbstractGotoSymbolQuickAccessProvider } from '../../../contrib/quickAccess/browser/gotoSymbolQuickAccess';
import { Registry } from '../../../../platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions } from '../../../../platform/quickinput/common/quickAccess';
import { ICodeEditorService } from '../../../browser/services/codeEditorService';
import { QuickOutlineNLS } from '../../../common/standaloneStrings';
import { Event } from '../../../../base/common/event';
import { EditorAction, registerEditorAction } from '../../../browser/editorExtensions';
import { EditorContextKeys } from '../../../common/editorContextKeys';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { IQuickInputService, ItemActivation } from '../../../../platform/quickinput/common/quickInput';
import { IOutlineModelService } from '../../../contrib/documentSymbols/browser/outlineModel';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures';

export class StandaloneGotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = Event.None;

	constructor(
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IOutlineModelService outlineModelService: IOutlineModelService,
	) {
		super(languageFeaturesService, outlineModelService);
	}

	protected get activeTextEditorControl() {
		return this.editorService.getFocusedCodeEditor() ?? undefined;
	}
}

export class GotoSymbolAction extends EditorAction {

	static readonly ID = 'editor.action.quickOutline';

	constructor() {
		super({
			id: GotoSymbolAction.ID,
			label: QuickOutlineNLS.quickOutlineActionLabel,
			alias: 'Go to Symbol...',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: 'navigation',
				order: 3
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(IQuickInputService).quickAccess.show(AbstractGotoSymbolQuickAccessProvider.PREFIX, { itemActivation: ItemActivation.NONE });
	}
}

registerEditorAction(GotoSymbolAction);

Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess).registerQuickAccessProvider({
	ctor: StandaloneGotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	helpEntries: [
		{ description: QuickOutlineNLS.quickOutlineActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, commandId: GotoSymbolAction.ID },
		{ description: QuickOutlineNLS.quickOutlineByCategoryActionLabel, prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY }
	]
});
