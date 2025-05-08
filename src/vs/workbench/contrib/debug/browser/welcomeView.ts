/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { OpenFileAction, OpenFileFolderAction, OpenFolderAction } from '../../../browser/actions/workspaceActions.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { Extensions, IViewDescriptorService, IViewsRegistry, ViewContentGroups } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, IDebugService } from '../common/debug.js';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_START_COMMAND_ID } from './debugCommands.js';

const debugStartLanguageKey = 'debugStartLanguage';
const CONTEXT_DEBUG_START_LANGUAGE = new RawContextKey<string>(debugStartLanguageKey, undefined);
const CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR = new RawContextKey<boolean>('debuggerInterestedInActiveEditor', false);

export class WelcomeView extends ViewPane {

	static readonly ID = 'workbench.debug.welcome';
	static readonly LABEL: ILocalizedString = localize2('run', "Run");

	private debugStartLanguageContext: IContextKey<string | undefined>;
	private debuggerInterestedContext: IContextKey<boolean>;

	constructor(
		options: IViewletViewOptions,
		@IThemeService themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDebugService private readonly debugService: IDebugService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IStorageService storageSevice: IStorageService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.debugStartLanguageContext = CONTEXT_DEBUG_START_LANGUAGE.bindTo(contextKeyService);
		this.debuggerInterestedContext = CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR.bindTo(contextKeyService);
		const lastSetLanguage = storageSevice.get(debugStartLanguageKey, StorageScope.WORKSPACE);
		this.debugStartLanguageContext.set(lastSetLanguage);

		const setContextKey = () => {
			let editorControl = this.editorService.activeTextEditorControl;
			if (isDiffEditor(editorControl)) {
				editorControl = editorControl.getModifiedEditor();
			}

			if (isCodeEditor(editorControl)) {
				const model = editorControl.getModel();
				const language = model ? model.getLanguageId() : undefined;
				if (language && this.debugService.getAdapterManager().someDebuggerInterestedInLanguage(language)) {
					this.debugStartLanguageContext.set(language);
					this.debuggerInterestedContext.set(true);
					storageSevice.store(debugStartLanguageKey, language, StorageScope.WORKSPACE, StorageTarget.MACHINE);
					return;
				}
			}
			this.debuggerInterestedContext.set(false);
		};

		const disposables = new DisposableStore();
		this._register(disposables);

		this._register(editorService.onDidActiveEditorChange(() => {
			disposables.clear();

			let editorControl = this.editorService.activeTextEditorControl;
			if (isDiffEditor(editorControl)) {
				editorControl = editorControl.getModifiedEditor();
			}

			if (isCodeEditor(editorControl)) {
				disposables.add(editorControl.onDidChangeModelLanguage(setContextKey));
			}

			setContextKey();
		}));
		this._register(this.debugService.getAdapterManager().onDidRegisterDebugger(setContextKey));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				setContextKey();
			}
		}));
		setContextKey();

		const debugKeybinding = this.keybindingService.lookupKeybinding(DEBUG_START_COMMAND_ID);
		debugKeybindingLabel = debugKeybinding ? ` (${debugKeybinding.getLabel()})` : '';
	}

	override shouldShowWelcome(): boolean {
		return true;
	}
}

const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
	content: localize(
		{
			key: 'openAFileWhichCanBeDebugged',
			comment: [
				'Please do not translate the word "command", it is part of our internal syntax which must not change',
				'{Locked="](command:{0})"}'
			]
		},
		"[Open a file](command:{0}) which can be debugged or run.", (isMacintosh && !isWeb) ? OpenFileFolderAction.ID : OpenFileAction.ID
	),
	when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUGGER_INTERESTED_IN_ACTIVE_EDITOR.toNegated()),
	group: ViewContentGroups.Open,
});

let debugKeybindingLabel = '';
viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
	content: `[${localize('runAndDebugAction', "Run and Debug")}${debugKeybindingLabel}](command:${DEBUG_START_COMMAND_ID})`,
	when: CONTEXT_DEBUGGERS_AVAILABLE,
	group: ViewContentGroups.Debug,
	// Allow inserting more buttons directly after this one (by setting order to 1).
	order: 1
});

viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
	content: localize(
		{
			key: 'customizeRunAndDebug',
			comment: [
				'Please do not translate the word "command", it is part of our internal syntax which must not change',
				'{Locked="](command:{0})"}'
			]
		},
		"To customize Run and Debug [create a launch.json file](command:{0}).", `${DEBUG_CONFIGURE_COMMAND_ID}?${encodeURIComponent(JSON.stringify([{ addNew: true }]))}`),
	when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, WorkbenchStateContext.notEqualsTo('empty')),
	group: ViewContentGroups.Debug
});

viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
	content: localize(
		{
			key: 'customizeRunAndDebugOpenFolder',
			comment: [
				'Please do not translate the word "command", it is part of our internal syntax which must not change',
				'Please do not translate "launch.json", it is the specific configuration file name',
				'{Locked="](command:{0})"}',
			]
		},
		"To customize Run and Debug, [open a folder](command:{0}) and create a launch.json file.", (isMacintosh && !isWeb) ? OpenFileFolderAction.ID : OpenFolderAction.ID),
	when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, WorkbenchStateContext.isEqualTo('empty')),
	group: ViewContentGroups.Debug
});

viewsRegistry.registerViewWelcomeContent(WelcomeView.ID, {
	content: localize('allDebuggersDisabled', "All debug extensions are disabled. Enable a debug extension or install a new one from the Marketplace."),
	when: CONTEXT_DEBUG_EXTENSION_AVAILABLE.toNegated(),
	group: ViewContentGroups.Debug
});
