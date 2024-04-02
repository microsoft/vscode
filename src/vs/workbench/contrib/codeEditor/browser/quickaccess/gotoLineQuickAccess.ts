/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { IKeyMods, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { AbstractGotoLineQuickAccessProvider } from 'vs/editor/contrib/quickAccess/browser/gotoLineQuickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions as QuickaccesExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickAccessTextEditorContext } from 'vs/editor/contrib/quickAccess/browser/editorNavigationQuickAccess';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export class GotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench?.editor;

		return {
			openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview
		};
	}

	protected get activeTextEditorControl() {
		return this.editorService.activeTextEditorControl;
	}

	protected override gotoLocation(context: IQuickAccessTextEditorContext, options: { range: IRange; keyMods: IKeyMods; forceSideBySide?: boolean; preserveFocus?: boolean }): void {

		// Check for sideBySide use
		if ((options.keyMods.alt || (this.configuration.openEditorPinned && options.keyMods.ctrlCmd) || options.forceSideBySide) && this.editorService.activeEditor) {
			context.restoreViewState?.(); // since we open to the side, restore view state in this editor

			const editorOptions: ITextEditorOptions = {
				selection: options.range,
				pinned: options.keyMods.ctrlCmd || this.configuration.openEditorPinned,
				preserveFocus: options.preserveFocus
			};

			this.editorGroupService.sideGroup.openEditor(this.editorService.activeEditor, editorOptions);
		}

		// Otherwise let parent handle it
		else {
			super.gotoLocation(context, options);
		}
	}
}

class GotoLineAction extends Action2 {

	static readonly ID = 'workbench.action.gotoLine';

	constructor() {
		super({
			id: GotoLineAction.ID,
			title: localize2('gotoLine', 'Go to Line/Column...'),
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: null,
				primary: KeyMod.CtrlCmd | KeyCode.KeyG,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KeyG }
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IQuickInputService).quickAccess.show(GotoLineQuickAccessProvider.PREFIX);
	}
}

registerAction2(GotoLineAction);

Registry.as<IQuickAccessRegistry>(QuickaccesExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: GotoLineQuickAccessProvider,
	prefix: AbstractGotoLineQuickAccessProvider.PREFIX,
	placeholder: localize('gotoLineQuickAccessPlaceholder', "Type the line number and optional column to go to (e.g. 42:5 for line 42 and column 5)."),
	helpEntries: [{ description: localize('gotoLineQuickAccess', "Go to Line/Column"), commandId: GotoLineAction.ID }]
});
