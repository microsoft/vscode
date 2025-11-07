/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IKeyMods, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { AbstractGotoLineQuickAccessProvider } from '../../../../../editor/contrib/quickAccess/browser/gotoLineQuickAccess.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IQuickAccessRegistry, Extensions as QuickaccesExtensions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEditorConfiguration } from '../../../../common/editor.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { KeyMod, KeyCode } from '../../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IQuickAccessTextEditorContext } from '../../../../../editor/contrib/quickAccess/browser/editorNavigationQuickAccess.js';
import { ITextEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';

export class GotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange: Event<void>;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService protected override readonly storageService: IStorageService
	) {
		super();
		this.onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;
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
	placeholder: localize('gotoLineQuickAccessPlaceholder', "Type the line number and optional column to go to (e.g. :42:5 for line 42, column 5). Type :: to go to a character offset (e.g. ::1024 for character 1024 from the start of the file). Use negative values to navigate backwards."),
	helpEntries: [{ description: localize('gotoLineQuickAccess', "Go to Line/Column"), commandId: GotoLineAction.ID }]
});
