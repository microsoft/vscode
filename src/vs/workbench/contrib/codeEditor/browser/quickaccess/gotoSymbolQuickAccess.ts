/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IKeyMods, IQuickPickSeparator, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IRange } from 'vs/editor/common/core/range';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickAccessRegistry, Extensions as QuickaccessExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { AbstractGotoSymbolQuickAccessProvider, IGotoSymbolQuickPickItem } from 'vs/editor/contrib/quickAccess/gotoSymbolQuickAccess';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { ITextModel } from 'vs/editor/common/model';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { prepareQuery } from 'vs/base/common/fuzzyScorer';

export class GotoSymbolQuickAccessProvider extends AbstractGotoSymbolQuickAccessProvider {

	protected readonly onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super({
			openSideBySideDirection: () => this.configuration.openSideBySideDirection
		});
	}

	private get configuration() {
		const editorConfig = this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor;

		return {
			openEditorPinned: !editorConfig.enablePreviewFromQuickOpen,
			openSideBySideDirection: editorConfig.openSideBySideDirection
		};
	}

	protected get activeTextEditorControl() {
		return this.editorService.activeTextEditorControl;
	}

	protected gotoLocation(editor: IEditor, options: { range: IRange, keyMods: IKeyMods, forceSideBySide?: boolean, preserveFocus?: boolean }): void {

		// Check for sideBySide use
		if ((options.keyMods.ctrlCmd || options.forceSideBySide) && this.editorService.activeEditor) {
			this.editorService.openEditor(this.editorService.activeEditor, {
				selection: options.range,
				pinned: options.keyMods.alt || this.configuration.openEditorPinned,
				preserveFocus: options.preserveFocus
			}, SIDE_GROUP);
		}

		// Otherwise let parent handle it
		else {
			super.gotoLocation(editor, options);
		}
	}


	//#region public methods to use this picker from other pickers

	private static readonly SYMBOL_PICKS_TIMEOUT = 8000;

	async getSymbolPicks(model: ITextModel, filter: string, options: { extraContainerLabel?: string }, disposables: DisposableStore, token: CancellationToken): Promise<Array<IGotoSymbolQuickPickItem | IQuickPickSeparator>> {

		// If the registry does not know the model, we wait for as long as
		// the registry knows it. This helps in cases where a language
		// registry was not activated yet for providing any symbols.
		// To not wait forever, we eventually timeout though.
		const result = await Promise.race([
			this.waitForLanguageSymbolRegistry(model, disposables),
			timeout(GotoSymbolQuickAccessProvider.SYMBOL_PICKS_TIMEOUT)
		]);

		if (!result || token.isCancellationRequested) {
			return [];
		}

		return this.doGetSymbolPicks(this.getDocumentSymbols(model, true, token), prepareQuery(filter), options, token);
	}

	addDecorations(editor: IEditor, range: IRange): void {
		super.addDecorations(editor, range);
	}

	clearDecorations(editor: IEditor): void {
		super.clearDecorations(editor);
	}

	//#endregion
}

Registry.as<IQuickAccessRegistry>(QuickaccessExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: GotoSymbolQuickAccessProvider,
	prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
	contextKey: 'inFileSymbolsPicker',
	placeholder: localize('gotoSymbolQuickAccessPlaceholder', "Type the name of a symbol to go to."),
	helpEntries: [
		{ description: localize('gotoSymbolQuickAccess', "Go to Symbol in Editor"), prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX, needsEditor: true },
		{ description: localize('gotoSymbolByCategoryQuickAccess', "Go to Symbol in Editor by Category"), prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY, needsEditor: true }
	]
});

export class GotoSymbolAction extends Action {

	static readonly ID = 'workbench.action.gotoSymbol';
	static readonly LABEL = localize('gotoSymbol', "Go to Symbol in Editor...");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(id, label);
	}

	async run(): Promise<void> {
		this.quickInputService.quickAccess.show(GotoSymbolQuickAccessProvider.PREFIX);
	}
}

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(SyncActionDescriptor.create(GotoSymbolAction, GotoSymbolAction.ID, GotoSymbolAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_O
}), 'Go to Symbol in Editor...');
