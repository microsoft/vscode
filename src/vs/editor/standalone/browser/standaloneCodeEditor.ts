/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as aria from '../../../base/browser/ui/aria/aria.js';
import { Disposable, IDisposable, toDisposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ICodeEditor, IDiffEditor, IDiffEditorConstructionOptions } from '../../browser/editorBrowser.js';
import { ICodeEditorService } from '../../browser/services/codeEditorService.js';
import { CodeEditorWidget } from '../../browser/widget/codeEditor/codeEditorWidget.js';
import { IDiffEditorOptions, IEditorOptions } from '../../common/config/editorOptions.js';
import { InternalEditorAction } from '../../common/editorAction.js';
import { IModelChangedEvent } from '../../common/editorCommon.js';
import { ITextModel } from '../../common/model.js';
import { StandaloneKeybindingService, updateConfigurationService } from './standaloneServices.js';
import { IStandaloneThemeService } from '../common/standaloneTheme.js';
import { IMenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandHandler, ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyValue, IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { StandaloneCodeEditorNLS } from '../../common/standaloneStrings.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { IEditorProgressService } from '../../../platform/progress/common/progress.js';
import { StandaloneThemeService } from './standaloneThemeService.js';
import { IModelService } from '../../common/services/model.js';
import { ILanguageSelection, ILanguageService } from '../../common/languages/language.js';
import { URI } from '../../../base/common/uri.js';
import { StandaloneCodeEditorService } from './standaloneCodeEditorService.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../common/languages/modesRegistry.js';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry.js';
import { IEditorConstructionOptions } from '../../browser/config/editorConfiguration.js';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures.js';
import { DiffEditorWidget } from '../../browser/widget/diffEditor/diffEditorWidget.js';
import { IAccessibilitySignalService } from '../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { setHoverDelegateFactory } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../platform/hover/browser/hover.js';
import { setBaseLayerHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate2.js';

/**
 * Description of an action contribution
 */
export interface IActionDescriptor {
	/**
	 * An unique identifier of the contributed action.
	 */
	id: string;
	/**
	 * A label of the action that will be presented to the user.
	 */
	label: string;
	/**
	 * Precondition rule. The value should be a [context key expression](https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts).
	 */
	precondition?: string;
	/**
	 * An array of keybindings for the action.
	 */
	keybindings?: number[];
	/**
	 * The keybinding rule (condition on top of precondition).
	 */
	keybindingContext?: string;
	/**
	 * Control if the action should show up in the context menu and where.
	 * The context menu of the editor has these default:
	 *   navigation - The navigation group comes first in all cases.
	 *   1_modification - This group comes next and contains commands that modify your code.
	 *   9_cutcopypaste - The last default group with the basic editing commands.
	 * You can also create your own group.
	 * Defaults to null (don't show in context menu).
	 */
	contextMenuGroupId?: string;
	/**
	 * Control the order in the context menu group.
	 */
	contextMenuOrder?: number;
	/**
	 * Method that will be executed when the action is triggered.
	 * @param editor The editor instance is passed in as a convenience
	 */
	run(editor: ICodeEditor, ...args: any[]): void | Promise<void>;
}

/**
 * Options which apply for all editors.
 */
export interface IGlobalEditorOptions {
	/**
	 * The number of spaces a tab is equal to.
	 * This setting is overridden based on the file contents when `detectIndentation` is on.
	 * Defaults to 4.
	 */
	tabSize?: number;
	/**
	 * Insert spaces when pressing `Tab`.
	 * This setting is overridden based on the file contents when `detectIndentation` is on.
	 * Defaults to true.
	 */
	insertSpaces?: boolean;
	/**
	 * Controls whether `tabSize` and `insertSpaces` will be automatically detected when a file is opened based on the file contents.
	 * Defaults to true.
	 */
	detectIndentation?: boolean;
	/**
	 * Remove trailing auto inserted whitespace.
	 * Defaults to true.
	 */
	trimAutoWhitespace?: boolean;
	/**
	 * Special handling for large files to disable certain memory intensive features.
	 * Defaults to true.
	 */
	largeFileOptimizations?: boolean;
	/**
	 * Controls whether completions should be computed based on words in the document.
	 * Defaults to true.
	 */
	wordBasedSuggestions?: 'off' | 'currentDocument' | 'matchingDocuments' | 'allDocuments';
	/**
	 * Controls whether word based completions should be included from opened documents of the same language or any language.
	 */
	wordBasedSuggestionsOnlySameLanguage?: boolean;
	/**
	 * Controls whether the semanticHighlighting is shown for the languages that support it.
	 * true: semanticHighlighting is enabled for all themes
	 * false: semanticHighlighting is disabled for all themes
	 * 'configuredByTheme': semanticHighlighting is controlled by the current color theme's semanticHighlighting setting.
	 * Defaults to 'byTheme'.
	 */
	'semanticHighlighting.enabled'?: true | false | 'configuredByTheme';
	/**
	 * Keep peek editors open even when double-clicking their content or when hitting `Escape`.
	 * Defaults to false.
	 */
	stablePeek?: boolean;
	/**
	 * Lines above this length will not be tokenized for performance reasons.
	 * Defaults to 20000.
	 */
	maxTokenizationLineLength?: number;
	/**
	 * Theme to be used for rendering.
	 * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light'.
	 * You can create custom themes via `monaco.editor.defineTheme`.
	 * To switch a theme, use `monaco.editor.setTheme`.
	 * **NOTE**: The theme might be overwritten if the OS is in high contrast mode, unless `autoDetectHighContrast` is set to false.
	 */
	theme?: string;
	/**
	 * If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme.
	 * Defaults to true.
	 */
	autoDetectHighContrast?: boolean;
}

/**
 * The options to create an editor.
 */
export interface IStandaloneEditorConstructionOptions extends IEditorConstructionOptions, IGlobalEditorOptions {
	/**
	 * The initial model associated with this code editor.
	 */
	model?: ITextModel | null;
	/**
	 * The initial value of the auto created model in the editor.
	 * To not automatically create a model, use `model: null`.
	 */
	value?: string;
	/**
	 * The initial language of the auto created model in the editor.
	 * To not automatically create a model, use `model: null`.
	 */
	language?: string;
	/**
	 * Initial theme to be used for rendering.
	 * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light.
	 * You can create custom themes via `monaco.editor.defineTheme`.
	 * To switch a theme, use `monaco.editor.setTheme`.
	 * **NOTE**: The theme might be overwritten if the OS is in high contrast mode, unless `autoDetectHighContrast` is set to false.
	 */
	theme?: string;
	/**
	 * If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme.
	 * Defaults to true.
	 */
	autoDetectHighContrast?: boolean;
	/**
	 * An URL to open when Ctrl+H (Windows and Linux) or Cmd+H (OSX) is pressed in
	 * the accessibility help dialog in the editor.
	 *
	 * Defaults to "https://go.microsoft.com/fwlink/?linkid=852450"
	 */
	accessibilityHelpUrl?: string;
	/**
	 * Container element to use for ARIA messages.
	 * Defaults to document.body.
	 */
	ariaContainerElement?: HTMLElement;
}

/**
 * The options to create a diff editor.
 */
export interface IStandaloneDiffEditorConstructionOptions extends IDiffEditorConstructionOptions {
	/**
	 * Initial theme to be used for rendering.
	 * The current out-of-the-box available themes are: 'vs' (default), 'vs-dark', 'hc-black', 'hc-light.
	 * You can create custom themes via `monaco.editor.defineTheme`.
	 * To switch a theme, use `monaco.editor.setTheme`.
	 * **NOTE**: The theme might be overwritten if the OS is in high contrast mode, unless `autoDetectHighContrast` is set to false.
	 */
	theme?: string;
	/**
	 * If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme.
	 * Defaults to true.
	 */
	autoDetectHighContrast?: boolean;
}

export interface IStandaloneCodeEditor extends ICodeEditor {
	updateOptions(newOptions: IEditorOptions & IGlobalEditorOptions): void;
	addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null;
	createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T): IContextKey<T>;
	addAction(descriptor: IActionDescriptor): IDisposable;
}

export interface IStandaloneDiffEditor extends IDiffEditor {
	addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null;
	createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T): IContextKey<T>;
	addAction(descriptor: IActionDescriptor): IDisposable;

	getOriginalEditor(): IStandaloneCodeEditor;
	getModifiedEditor(): IStandaloneCodeEditor;
}

let LAST_GENERATED_COMMAND_ID = 0;

let ariaDomNodeCreated = false;
/**
 * Create ARIA dom node inside parent,
 * or only for the first editor instantiation inside document.body.
 * @param parent container element for ARIA dom node
 */
function createAriaDomNode(parent: HTMLElement | undefined) {
	if (!parent) {
		if (ariaDomNodeCreated) {
			return;
		}
		ariaDomNodeCreated = true;
	}
	aria.setARIAContainer(parent || mainWindow.document.body);
}

/**
 * A code editor to be used both by the standalone editor and the standalone diff editor.
 */
export class StandaloneCodeEditor extends CodeEditorWidget implements IStandaloneCodeEditor {

	private readonly _standaloneKeybindingService: StandaloneKeybindingService | null;

	constructor(
		domElement: HTMLElement,
		_options: Readonly<IStandaloneEditorConstructionOptions>,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		const options = { ..._options };
		options.ariaLabel = options.ariaLabel || StandaloneCodeEditorNLS.editorViewAccessibleLabel;
		super(domElement, options, {}, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);

		if (keybindingService instanceof StandaloneKeybindingService) {
			this._standaloneKeybindingService = keybindingService;
		} else {
			this._standaloneKeybindingService = null;
		}

		createAriaDomNode(options.ariaContainerElement);

		setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, enableInstantHover, {}));
		setBaseLayerHoverDelegate(hoverService);
	}

	public addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null {
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add command because the editor is configured with an unrecognized KeybindingService');
			return null;
		}
		const commandId = 'DYNAMIC_' + (++LAST_GENERATED_COMMAND_ID);
		const whenExpression = ContextKeyExpr.deserialize(context);
		this._standaloneKeybindingService.addDynamicKeybinding(commandId, keybinding, handler, whenExpression);
		return commandId;
	}

	public createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T): IContextKey<T> {
		return this._contextKeyService.createKey(key, defaultValue);
	}

	public addAction(_descriptor: IActionDescriptor): IDisposable {
		if ((typeof _descriptor.id !== 'string') || (typeof _descriptor.label !== 'string') || (typeof _descriptor.run !== 'function')) {
			throw new Error('Invalid action descriptor, `id`, `label` and `run` are required properties!');
		}
		if (!this._standaloneKeybindingService) {
			console.warn('Cannot add keybinding because the editor is configured with an unrecognized KeybindingService');
			return Disposable.None;
		}

		// Read descriptor options
		const id = _descriptor.id;
		const label = _descriptor.label;
		const precondition = ContextKeyExpr.and(
			ContextKeyExpr.equals('editorId', this.getId()),
			ContextKeyExpr.deserialize(_descriptor.precondition)
		);
		const keybindings = _descriptor.keybindings;
		const keybindingsWhen = ContextKeyExpr.and(
			precondition,
			ContextKeyExpr.deserialize(_descriptor.keybindingContext)
		);
		const contextMenuGroupId = _descriptor.contextMenuGroupId || null;
		const contextMenuOrder = _descriptor.contextMenuOrder || 0;
		const run = (_accessor?: ServicesAccessor, ...args: any[]): Promise<void> => {
			return Promise.resolve(_descriptor.run(this, ...args));
		};


		const toDispose = new DisposableStore();

		// Generate a unique id to allow the same descriptor.id across multiple editor instances
		const uniqueId = this.getId() + ':' + id;

		// Register the command
		toDispose.add(CommandsRegistry.registerCommand(uniqueId, run));

		// Register the context menu item
		if (contextMenuGroupId) {
			const menuItem: IMenuItem = {
				command: {
					id: uniqueId,
					title: label
				},
				when: precondition,
				group: contextMenuGroupId,
				order: contextMenuOrder
			};
			toDispose.add(MenuRegistry.appendMenuItem(MenuId.EditorContext, menuItem));
		}

		// Register the keybindings
		if (Array.isArray(keybindings)) {
			for (const kb of keybindings) {
				toDispose.add(this._standaloneKeybindingService.addDynamicKeybinding(uniqueId, kb, run, keybindingsWhen));
			}
		}

		// Finally, register an internal editor action
		const internalAction = new InternalEditorAction(
			uniqueId,
			label,
			label,
			undefined,
			precondition,
			(...args: unknown[]) => Promise.resolve(_descriptor.run(this, ...args)),
			this._contextKeyService
		);

		// Store it under the original id, such that trigger with the original id will work
		this._actions.set(id, internalAction);
		toDispose.add(toDisposable(() => {
			this._actions.delete(id);
		}));

		return toDispose;
	}

	protected override _triggerCommand(handlerId: string, payload: any): void {
		if (this._codeEditorService instanceof StandaloneCodeEditorService) {
			// Help commands find this editor as the active editor
			try {
				this._codeEditorService.setActiveCodeEditor(this);
				super._triggerCommand(handlerId, payload);
			} finally {
				this._codeEditorService.setActiveCodeEditor(null);
			}
		} else {
			super._triggerCommand(handlerId, payload);
		}
	}
}

export class StandaloneEditor extends StandaloneCodeEditor implements IStandaloneCodeEditor {

	private readonly _configurationService: IConfigurationService;
	private readonly _standaloneThemeService: IStandaloneThemeService;
	private _ownsModel: boolean;

	constructor(
		domElement: HTMLElement,
		_options: Readonly<IStandaloneEditorConstructionOptions> | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStandaloneThemeService themeService: IStandaloneThemeService,
		@INotificationService notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		const options = { ..._options };
		updateConfigurationService(configurationService, options, false);
		const themeDomRegistration = (<StandaloneThemeService>themeService).registerEditorContainer(domElement);
		if (typeof options.theme === 'string') {
			themeService.setTheme(options.theme);
		}
		if (typeof options.autoDetectHighContrast !== 'undefined') {
			themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
		}
		const _model: ITextModel | null | undefined = options.model;
		delete options.model;
		super(domElement, options, instantiationService, codeEditorService, commandService, contextKeyService, hoverService, keybindingService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService);

		this._configurationService = configurationService;
		this._standaloneThemeService = themeService;
		this._register(themeDomRegistration);

		let model: ITextModel | null;
		if (typeof _model === 'undefined') {
			const languageId = languageService.getLanguageIdByMimeType(options.language) || options.language || PLAINTEXT_LANGUAGE_ID;
			model = createTextModel(modelService, languageService, options.value || '', languageId, undefined);
			this._ownsModel = true;
		} else {
			model = _model;
			this._ownsModel = false;
		}

		this._attachModel(model);
		if (model) {
			const e: IModelChangedEvent = {
				oldModelUrl: null,
				newModelUrl: model.uri
			};
			this._onDidChangeModel.fire(e);
		}
	}

	public override dispose(): void {
		super.dispose();
	}

	public override updateOptions(newOptions: Readonly<IEditorOptions & IGlobalEditorOptions>): void {
		updateConfigurationService(this._configurationService, newOptions, false);
		if (typeof newOptions.theme === 'string') {
			this._standaloneThemeService.setTheme(newOptions.theme);
		}
		if (typeof newOptions.autoDetectHighContrast !== 'undefined') {
			this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
		}
		super.updateOptions(newOptions);
	}

	protected override _postDetachModelCleanup(detachedModel: ITextModel): void {
		super._postDetachModelCleanup(detachedModel);
		if (detachedModel && this._ownsModel) {
			detachedModel.dispose();
			this._ownsModel = false;
		}
	}
}

export class StandaloneDiffEditor2 extends DiffEditorWidget implements IStandaloneDiffEditor {

	private readonly _configurationService: IConfigurationService;
	private readonly _standaloneThemeService: IStandaloneThemeService;

	constructor(
		domElement: HTMLElement,
		_options: Readonly<IStandaloneDiffEditorConstructionOptions> | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IStandaloneThemeService themeService: IStandaloneThemeService,
		@INotificationService notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IEditorProgressService editorProgressService: IEditorProgressService,
		@IClipboardService clipboardService: IClipboardService,
		@IAccessibilitySignalService accessibilitySignalService: IAccessibilitySignalService,
	) {
		const options = { ..._options };
		updateConfigurationService(configurationService, options, true);
		const themeDomRegistration = (<StandaloneThemeService>themeService).registerEditorContainer(domElement);
		if (typeof options.theme === 'string') {
			themeService.setTheme(options.theme);
		}
		if (typeof options.autoDetectHighContrast !== 'undefined') {
			themeService.setAutoDetectHighContrast(Boolean(options.autoDetectHighContrast));
		}

		super(
			domElement,
			options,
			{},
			contextKeyService,
			instantiationService,
			codeEditorService,
			accessibilitySignalService,
			editorProgressService,
		);

		this._configurationService = configurationService;
		this._standaloneThemeService = themeService;

		this._register(themeDomRegistration);
	}

	public override dispose(): void {
		super.dispose();
	}

	public override updateOptions(newOptions: Readonly<IDiffEditorOptions & IGlobalEditorOptions>): void {
		updateConfigurationService(this._configurationService, newOptions, true);
		if (typeof newOptions.theme === 'string') {
			this._standaloneThemeService.setTheme(newOptions.theme);
		}
		if (typeof newOptions.autoDetectHighContrast !== 'undefined') {
			this._standaloneThemeService.setAutoDetectHighContrast(Boolean(newOptions.autoDetectHighContrast));
		}
		super.updateOptions(newOptions);
	}

	protected override _createInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorOptions>): CodeEditorWidget {
		return instantiationService.createInstance(StandaloneCodeEditor, container, options);
	}

	public override getOriginalEditor(): IStandaloneCodeEditor {
		return <StandaloneCodeEditor>super.getOriginalEditor();
	}

	public override getModifiedEditor(): IStandaloneCodeEditor {
		return <StandaloneCodeEditor>super.getModifiedEditor();
	}

	public addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null {
		return this.getModifiedEditor().addCommand(keybinding, handler, context);
	}

	public createContextKey<T extends ContextKeyValue = ContextKeyValue>(key: string, defaultValue: T): IContextKey<T> {
		return this.getModifiedEditor().createContextKey(key, defaultValue);
	}

	public addAction(descriptor: IActionDescriptor): IDisposable {
		return this.getModifiedEditor().addAction(descriptor);
	}
}

/**
 * @internal
 */
export function createTextModel(modelService: IModelService, languageService: ILanguageService, value: string, languageId: string | undefined, uri: URI | undefined): ITextModel {
	value = value || '';
	if (!languageId) {
		const firstLF = value.indexOf('\n');
		let firstLine = value;
		if (firstLF !== -1) {
			firstLine = value.substring(0, firstLF);
		}
		return doCreateModel(modelService, value, languageService.createByFilepathOrFirstLine(uri || null, firstLine), uri);
	}
	return doCreateModel(modelService, value, languageService.createById(languageId), uri);
}

/**
 * @internal
 */
function doCreateModel(modelService: IModelService, value: string, languageSelection: ILanguageSelection, uri: URI | undefined): ITextModel {
	return modelService.createModel(value, languageSelection, uri);
}
