/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { append, $, Dimension, trackFocus } from '../../../../base/browser/dom.js';
import { InputValidationType, ISCMInput, IInputValidation, ISCMViewService, SCMInputChangeReason, ISCMInputValueProviderContext } from '../common/scm.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextViewService, IContextMenuService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuItemAction, IMenuService, registerAction2, MenuId, Action2 } from '../../../../platform/actions/common/actions.js';
import { IAction, ActionRunner, Action } from '../../../../base/common/actions.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard.js';
import { EditorDictation } from '../../codeEditor/browser/dictation/editorDictation.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import * as platform from '../../../../base/common/platform.js';
import { format } from '../../../../base/common/strings.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ColorDetector } from '../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { DragAndDropController } from '../../../../editor/contrib/dnd/browser/dnd.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { FormatOnType } from '../../../../editor/contrib/format/browser/formatActions.js';
import { EditorOption, EditorOptions, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { HiddenItemStrategy, IMenuWorkbenchToolBarOptions, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { clamp } from '../../../../base/common/numbers.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { autorun, runOnChange } from '../../../../base/common/observable.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import product from '../../../../platform/product/common/product.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../chat/browser/actions/chatActions.js';

export const SCMInputContextKeys = {
	SCMInputHasValidationMessage: new RawContextKey<boolean>('scmInputHasValidationMessage', false),
};

const enum SCMInputWidgetCommandId {
	CancelAction = 'scm.input.cancelAction',
	SetupAction = 'scm.input.triggerSetup'
}

const enum SCMInputWidgetStorageKey {
	LastActionId = 'scm.input.lastActionId'
}

class SCMInputWidgetActionRunner extends ActionRunner {

	private readonly _runningActions = new Set<IAction>();
	public get runningActions(): Set<IAction> { return this._runningActions; }

	private _cts: CancellationTokenSource | undefined;

	constructor(
		private readonly input: ISCMInput,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
	}

	protected override async runAction(action: IAction): Promise<void> {
		try {
			// Cancel previous action
			if (this.runningActions.size !== 0) {
				this._cts?.cancel();

				if (action.id === SCMInputWidgetCommandId.CancelAction) {
					return;
				}
			}

			// Create action context
			const context: ISCMInputValueProviderContext[] = [];
			for (const group of this.input.repository.provider.groups) {
				context.push({
					resourceGroupId: group.id,
					resources: [...group.resources.map(r => r.sourceUri)]
				});
			}

			// Run action
			this._runningActions.add(action);
			this._cts = new CancellationTokenSource();
			await action.run(...[this.input.repository.provider.rootUri, context, this._cts.token]);
		} finally {
			this._runningActions.delete(action);

			// Save last action
			if (this._runningActions.size === 0) {
				const actionId = action.id === SCMInputWidgetCommandId.SetupAction
					? product.defaultChatAgent?.generateCommitMessageCommand ?? action.id
					: action.id;
				this.storageService.store(SCMInputWidgetStorageKey.LastActionId, actionId, StorageScope.PROFILE, StorageTarget.USER);
			}
		}
	}

}

class SCMInputWidgetToolbar extends WorkbenchToolBar {

	private _dropdownActions: IAction[] = [];
	get dropdownActions(): IAction[] { return this._dropdownActions; }

	private _dropdownAction: IAction;
	get dropdownAction(): IAction { return this._dropdownAction; }

	private _cancelAction: IAction;

	private _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _disposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		container: HTMLElement,
		options: IMenuWorkbenchToolBarOptions | undefined,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);

		this._dropdownAction = new Action(
			'scmInputMoreActions',
			localize('scmInputMoreActions', "More Actions..."),
			'codicon-chevron-down');

		this._cancelAction = new MenuItemAction({
			id: SCMInputWidgetCommandId.CancelAction,
			title: localize('scmInputCancelAction', "Cancel"),
			icon: Codicon.stopCircle,
		}, undefined, undefined, undefined, undefined, contextKeyService, commandService);
	}

	public setInput(input: ISCMInput): void {
		this._disposables.value = new DisposableStore();

		const contextKeyService = this.contextKeyService.createOverlay([
			['scmProvider', input.repository.provider.providerId],
			['scmProviderRootUri', input.repository.provider.rootUri?.toString()],
			['scmProviderHasRootUri', !!input.repository.provider.rootUri]
		]);

		const menu = this._disposables.value.add(this.menuService.createMenu(MenuId.SCMInputBox, contextKeyService, { emitEventsForSubmenuChanges: true }));

		const isEnabled = (): boolean => {
			return input.repository.provider.groups.some(g => g.resources.length > 0);
		};

		const updateToolbar = () => {
			const actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));

			for (const action of actions) {
				action.enabled = isEnabled();
			}
			this._dropdownAction.enabled = isEnabled();

			let primaryAction: IAction | undefined = undefined;

			if ((this.actionRunner as SCMInputWidgetActionRunner).runningActions.size !== 0) {
				primaryAction = this._cancelAction;
			} else if (actions.length === 1) {
				primaryAction = actions[0];
			} else if (actions.length > 1) {
				const lastActionId = this.storageService.get(SCMInputWidgetStorageKey.LastActionId, StorageScope.PROFILE, '');
				primaryAction = actions.find(a => a.id === lastActionId) ?? actions[0];
			}

			this._dropdownActions = actions.length === 1 ? [] : actions;
			super.setActions(primaryAction ? [primaryAction] : [], []);

			this._onDidChange.fire();
		};

		this._disposables.value.add(menu.onDidChange(() => updateToolbar()));
		this._disposables.value.add(input.repository.provider.onDidChangeResources(() => updateToolbar()));
		this._disposables.value.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, SCMInputWidgetStorageKey.LastActionId, this._disposables.value)(() => updateToolbar()));

		this.actionRunner = this._disposables.value.add(new SCMInputWidgetActionRunner(input, this.storageService));
		this._disposables.value.add(this.actionRunner.onWillRun(e => {
			if ((this.actionRunner as SCMInputWidgetActionRunner).runningActions.size === 0) {
				super.setActions([this._cancelAction], []);
				this._onDidChange.fire();
			}
		}));
		this._disposables.value.add(this.actionRunner.onDidRun(e => {
			if ((this.actionRunner as SCMInputWidgetActionRunner).runningActions.size === 0) {
				updateToolbar();
			}
		}));

		updateToolbar();
	}
}

class SCMInputWidgetEditorOptions {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private readonly defaultInputFontFamily = DEFAULT_FONT_FAMILY;

	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly overflowWidgetsDomNode: HTMLElement,
		private readonly configurationService: IConfigurationService) {

		const onDidChangeConfiguration = Event.filter(
			this.configurationService.onDidChangeConfiguration,
			e => {
				return e.affectsConfiguration('editor.accessibilitySupport') ||
					e.affectsConfiguration('editor.cursorBlinking') ||
					e.affectsConfiguration('editor.cursorStyle') ||
					e.affectsConfiguration('editor.cursorWidth') ||
					e.affectsConfiguration('editor.emptySelectionClipboard') ||
					e.affectsConfiguration('editor.fontFamily') ||
					e.affectsConfiguration('editor.rulers') ||
					e.affectsConfiguration('editor.wordWrap') ||
					e.affectsConfiguration('editor.wordSegmenterLocales') ||
					e.affectsConfiguration('scm.inputFontFamily') ||
					e.affectsConfiguration('scm.inputFontSize');
			},
			this._disposables
		);

		this._disposables.add(onDidChangeConfiguration(() => this._onDidChange.fire()));
	}

	getEditorConstructionOptions(): IEditorConstructionOptions {
		return {
			...getSimpleEditorOptions(this.configurationService),
			...this.getEditorOptions(),
			dragAndDrop: true,
			dropIntoEditor: { enabled: true },
			formatOnType: true,
			lineDecorationsWidth: 6,
			overflowWidgetsDomNode: this.overflowWidgetsDomNode,
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			scrollbar: {
				alwaysConsumeMouseWheel: false,
				vertical: 'hidden'
			},
			wrappingIndent: 'none',
			wrappingStrategy: 'advanced',
		};
	}

	getEditorOptions(): IEditorOptions {
		const fontFamily = this._getEditorFontFamily();
		const fontSize = this._getEditorFontSize();
		const lineHeight = this._getEditorLineHeight(fontSize);
		const wordSegmenterLocales = this.configurationService.getValue<string | string[]>('editor.wordSegmenterLocales');
		const accessibilitySupport = this.configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');
		const cursorBlinking = this.configurationService.getValue<'blink' | 'smooth' | 'phase' | 'expand' | 'solid'>('editor.cursorBlinking');
		const cursorStyle = this.configurationService.getValue<IEditorOptions['cursorStyle']>('editor.cursorStyle');
		const cursorWidth = this.configurationService.getValue<IEditorOptions['cursorWidth']>('editor.cursorWidth') ?? 1;
		const emptySelectionClipboard = this.configurationService.getValue<boolean>('editor.emptySelectionClipboard') === true;

		return { ...this._getEditorLanguageConfiguration(), accessibilitySupport, cursorBlinking, cursorStyle, cursorWidth, fontFamily, fontSize, lineHeight, emptySelectionClipboard, wordSegmenterLocales };
	}

	private _getEditorFontFamily(): string {
		const inputFontFamily = this.configurationService.getValue<string>('scm.inputFontFamily').trim();

		if (inputFontFamily.toLowerCase() === 'editor') {
			return this.configurationService.getValue<string>('editor.fontFamily').trim();
		}

		if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== 'default') {
			return inputFontFamily;
		}

		return this.defaultInputFontFamily;
	}

	private _getEditorFontSize(): number {
		return this.configurationService.getValue<number>('scm.inputFontSize');
	}

	private _getEditorLanguageConfiguration(): IEditorOptions {
		// editor.rulers
		const rulersConfig = this.configurationService.inspect('editor.rulers', { overrideIdentifier: 'scminput' });
		const rulers = rulersConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.rulers.validate(rulersConfig.value) : [];

		// editor.wordWrap
		const wordWrapConfig = this.configurationService.inspect('editor.wordWrap', { overrideIdentifier: 'scminput' });
		const wordWrap = wordWrapConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.wordWrap.validate(wordWrapConfig.value) : 'on';

		return { rulers, wordWrap };
	}

	private _getEditorLineHeight(fontSize: number): number {
		return Math.round(fontSize * 1.5);
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidChange.dispose();
	}

}

export class SCMInputWidget {

	private static readonly ValidationTimeouts: { [severity: number]: number } = {
		[InputValidationType.Information]: 5000,
		[InputValidationType.Warning]: 8000,
		[InputValidationType.Error]: 10000
	};

	private readonly contextKeyService: IContextKeyService;

	private element: HTMLElement;
	private editorContainer: HTMLElement;
	private readonly inputEditor: CodeEditorWidget;
	private readonly inputEditorOptions: SCMInputWidgetEditorOptions;
	private toolbarContainer: HTMLElement;
	private toolbar: SCMInputWidgetToolbar;
	private readonly disposables = new DisposableStore();

	private model: { readonly input: ISCMInput; readonly textModel: ITextModel } | undefined;
	private repositoryIdContextKey: IContextKey<string | undefined>;
	private validationMessageContextKey: IContextKey<boolean>;
	private readonly repositoryDisposables = new DisposableStore();

	private validation: IInputValidation | undefined;
	private validationContextView: IOpenContextView | undefined;
	private validationHasFocus: boolean = false;
	private _validationTimer: Timeout | undefined;

	// This is due to "Setup height change listener on next tick" above
	// https://github.com/microsoft/vscode/issues/108067
	private lastLayoutWasTrash = false;
	private shouldFocusAfterLayout = false;

	readonly onDidChangeContentHeight: Event<void>;

	get input(): ISCMInput | undefined {
		return this.model?.input;
	}

	set input(input: ISCMInput | undefined) {
		if (input === this.input) {
			return;
		}

		this.clearValidation();
		this.element.classList.remove('synthetic-focus');

		this.repositoryDisposables.clear();
		this.repositoryIdContextKey.set(input?.repository.id);

		if (!input) {
			this.inputEditor.setModel(undefined);
			this.model = undefined;
			return;
		}

		const textModel = input.repository.provider.inputBoxTextModel;
		this.inputEditor.setModel(textModel);

		if (this.configurationService.getValue('editor.wordBasedSuggestions', { resource: textModel.uri }) !== 'off') {
			this.configurationService.updateValue('editor.wordBasedSuggestions', 'off', { resource: textModel.uri }, ConfigurationTarget.MEMORY);
		}

		// Validation
		const validationDelayer = new ThrottledDelayer<void>(200);
		const validate = async () => {
			const position = this.inputEditor.getSelection()?.getStartPosition();
			const offset = position && textModel.getOffsetAt(position);
			const value = textModel.getValue();

			this.setValidation(await input.validateInput(value, offset || 0));
		};

		const triggerValidation = () => validationDelayer.trigger(validate);
		this.repositoryDisposables.add(validationDelayer);
		this.repositoryDisposables.add(this.inputEditor.onDidChangeCursorPosition(triggerValidation));

		// Adaptive indentation rules
		const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
		const onEnter = Event.filter(this.inputEditor.onKeyDown, e => e.keyCode === KeyCode.Enter, this.repositoryDisposables);
		this.repositoryDisposables.add(onEnter(() => textModel.detectIndentation(opts.insertSpaces, opts.tabSize)));

		// Keep model in sync with API
		textModel.setValue(input.value);
		this.repositoryDisposables.add(input.onDidChange(({ value, reason }) => {
			const currentValue = textModel.getValue();
			if (value === currentValue) { // circuit breaker
				return;
			}

			textModel.pushStackElement();
			textModel.pushEditOperations(null, [EditOperation.replaceMove(textModel.getFullModelRange(), value)], () => []);

			const position = reason === SCMInputChangeReason.HistoryPrevious
				? textModel.getFullModelRange().getStartPosition()
				: textModel.getFullModelRange().getEndPosition();
			this.inputEditor.setPosition(position);
			this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
		}));
		this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
		this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
		this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));
		this.repositoryDisposables.add(input.onDidClearValidation(() => this.clearValidation()));

		// Keep API in sync with model and validate
		this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
			input.setValue(textModel.getValue(), true);
			triggerValidation();
		}));

		// Aria label & placeholder text
		const accessibilityVerbosityConfig = observableConfigValue(
			AccessibilityVerbositySettingId.SourceControl, true, this.configurationService);

		const getAriaLabel = (placeholder: string, verbosity?: boolean) => {
			verbosity = verbosity ?? accessibilityVerbosityConfig.get();

			if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
				return placeholder;
			}

			const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
			return kbLabel
				? localize('scmInput.accessibilityHelp', "{0}, Use {1} to open Source Control Accessibility Help.", placeholder, kbLabel)
				: localize('scmInput.accessibilityHelpNoKb', "{0}, Run the Open Accessibility Help command for more information.", placeholder);
		};

		const getPlaceholderText = (): string => {
			const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
			const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
			return format(input.placeholder, label);
		};

		const updatePlaceholderText = () => {
			const placeholder = getPlaceholderText();
			const ariaLabel = getAriaLabel(placeholder);

			this.inputEditor.updateOptions({ ariaLabel, placeholder });
		};

		this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
		this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));

		this.repositoryDisposables.add(runOnChange(accessibilityVerbosityConfig, verbosity => {
			const placeholder = getPlaceholderText();
			const ariaLabel = getAriaLabel(placeholder, verbosity);

			this.inputEditor.updateOptions({ ariaLabel });
		}));

		updatePlaceholderText();

		// Update input template
		let commitTemplate = '';
		this.repositoryDisposables.add(autorun(reader => {
			if (!input.visible) {
				return;
			}

			const oldCommitTemplate = commitTemplate;
			commitTemplate = input.repository.provider.commitTemplate.read(reader);

			const value = textModel.getValue();
			if (value && value !== oldCommitTemplate) {
				return;
			}

			textModel.setValue(commitTemplate);
		}));

		// Update input enablement
		const updateEnablement = (enabled: boolean) => {
			this.inputEditor.updateOptions({ readOnly: !enabled });
		};
		this.repositoryDisposables.add(input.onDidChangeEnablement(enabled => updateEnablement(enabled)));
		updateEnablement(input.enabled);

		// Toolbar
		this.toolbar.setInput(input);

		// Save model
		this.model = { input, textModel };
	}

	get selections(): Selection[] | null {
		return this.inputEditor.getSelections();
	}

	set selections(selections: Selection[] | null) {
		if (selections) {
			this.inputEditor.setSelections(selections);
		}
	}

	private setValidation(validation: IInputValidation | undefined, options?: { focus?: boolean; timeout?: boolean }) {
		if (this._validationTimer) {
			clearTimeout(this._validationTimer);
			this._validationTimer = undefined;
		}

		this.validation = validation;
		this.renderValidation();

		if (options?.focus && !this.hasFocus()) {
			this.focus();
		}

		if (validation && options?.timeout) {
			this._validationTimer = setTimeout(() => this.setValidation(undefined), SCMInputWidget.ValidationTimeouts[validation.type]);
		}
	}

	constructor(
		container: HTMLElement,
		overflowWidgetsDomNode: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		this.element = append(container, $('.scm-editor'));
		this.editorContainer = append(this.element, $('.scm-editor-container'));
		this.toolbarContainer = append(this.element, $('.scm-editor-toolbar'));

		this.contextKeyService = this.disposables.add(contextKeyService.createScoped(this.element));
		this.repositoryIdContextKey = this.contextKeyService.createKey('scmRepository', undefined);
		this.validationMessageContextKey = SCMInputContextKeys.SCMInputHasValidationMessage.bindTo(this.contextKeyService);

		this.inputEditorOptions = new SCMInputWidgetEditorOptions(overflowWidgetsDomNode, this.configurationService);
		this.disposables.add(this.inputEditorOptions.onDidChange(this.onDidChangeEditorOptions, this));
		this.disposables.add(this.inputEditorOptions);

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				CodeActionController.ID,
				ColorDetector.ID,
				ContextMenuController.ID,
				CopyPasteController.ID,
				DragAndDropController.ID,
				DropIntoEditorController.ID,
				EditorDictation.ID,
				FormatOnType.ID,
				ContentHoverController.ID,
				GlyphHoverController.ID,
				InlineCompletionsController.ID,
				LinkDetector.ID,
				MenuPreventer.ID,
				MessageController.ID,
				PlaceholderTextContribution.ID,
				SelectionClipboardContributionID,
				SnippetController2.ID,
				SuggestController.ID
			]),
			isSimpleWidget: true
		};

		const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		const instantiationService2 = instantiationService.createChild(services, this.disposables);
		const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
		this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorConstructionOptions, codeEditorWidgetOptions);
		this.disposables.add(this.inputEditor);

		this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
			if (this.input?.repository) {
				this.scmViewService.focus(this.input.repository);
			}

			this.element.classList.add('synthetic-focus');
			this.renderValidation();
		}));
		this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
			this.element.classList.remove('synthetic-focus');

			setTimeout(() => {
				if (!this.validation || !this.validationHasFocus) {
					this.clearValidation();
				}
			}, 0);
		}));

		this.disposables.add(this.inputEditor.onDidBlurEditorWidget(() => {
			CopyPasteController.get(this.inputEditor)?.clearWidgets();
			DropIntoEditorController.get(this.inputEditor)?.clearWidgets();
		}));

		const firstLineKey = this.contextKeyService.createKey<boolean>('scmInputIsInFirstPosition', false);
		const lastLineKey = this.contextKeyService.createKey<boolean>('scmInputIsInLastPosition', false);

		this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
			const viewModel = this.inputEditor._getViewModel()!;
			const lastLineNumber = viewModel.getLineCount();
			const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
			firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
			lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
		}));
		this.disposables.add(this.inputEditor.onDidScrollChange(e => {
			this.toolbarContainer.classList.toggle('scroll-decoration', e.scrollTop > 0);
		}));

		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.showInputActionButton'))(() => this.layout(), this, this.disposables);

		this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, e => e.contentHeightChanged, this.disposables));

		// Toolbar
		this.toolbar = instantiationService2.createInstance(SCMInputWidgetToolbar, this.toolbarContainer, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction && this.toolbar.dropdownActions.length > 1) {
					return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, this.toolbar.dropdownAction, this.toolbar.dropdownActions, '', { actionRunner: this.toolbar.actionRunner, hoverDelegate: options.hoverDelegate });
				}

				return createActionViewItem(instantiationService, action, options);
			},
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			menuOptions: {
				shouldForwardArgs: true
			}
		});
		this.disposables.add(this.toolbar.onDidChange(() => this.layout()));
		this.disposables.add(this.toolbar);
	}

	getContentHeight(): number {
		const lineHeight = this.inputEditor.getOption(EditorOption.lineHeight);
		const { top, bottom } = this.inputEditor.getOption(EditorOption.padding);

		const inputMinLinesConfig = this.configurationService.getValue('scm.inputMinLineCount');
		const inputMinLines = typeof inputMinLinesConfig === 'number' ? clamp(inputMinLinesConfig, 1, 50) : 1;
		const editorMinHeight = inputMinLines * lineHeight + top + bottom;

		const inputMaxLinesConfig = this.configurationService.getValue('scm.inputMaxLineCount');
		const inputMaxLines = typeof inputMaxLinesConfig === 'number' ? clamp(inputMaxLinesConfig, 1, 50) : 10;
		const editorMaxHeight = inputMaxLines * lineHeight + top + bottom;

		return clamp(this.inputEditor.getContentHeight(), editorMinHeight, editorMaxHeight);
	}

	layout(): void {
		const editorHeight = this.getContentHeight();
		const toolbarWidth = this.getToolbarWidth();
		const dimension = new Dimension(this.element.clientWidth - toolbarWidth, editorHeight);

		if (dimension.width < 0) {
			this.lastLayoutWasTrash = true;
			return;
		}

		this.lastLayoutWasTrash = false;
		this.inputEditor.layout(dimension);
		this.renderValidation();

		const showInputActionButton = this.configurationService.getValue<boolean>('scm.showInputActionButton') === true;
		this.toolbarContainer.classList.toggle('hidden', !showInputActionButton || this.toolbar?.isEmpty() === true);

		if (this.shouldFocusAfterLayout) {
			this.shouldFocusAfterLayout = false;
			this.focus();
		}
	}

	focus(): void {
		if (this.lastLayoutWasTrash) {
			this.lastLayoutWasTrash = false;
			this.shouldFocusAfterLayout = true;
			return;
		}

		this.inputEditor.focus();
		this.element.classList.add('synthetic-focus');
	}

	hasFocus(): boolean {
		return this.inputEditor.hasTextFocus();
	}

	private onDidChangeEditorOptions(): void {
		this.inputEditor.updateOptions(this.inputEditorOptions.getEditorOptions());
	}

	private renderValidation(): void {
		this.clearValidation();

		this.element.classList.toggle('validation-info', this.validation?.type === InputValidationType.Information);
		this.element.classList.toggle('validation-warning', this.validation?.type === InputValidationType.Warning);
		this.element.classList.toggle('validation-error', this.validation?.type === InputValidationType.Error);

		if (!this.validation || !this.inputEditor.hasTextFocus()) {
			return;
		}

		this.validationMessageContextKey.set(true);
		const disposables = new DisposableStore();

		this.validationContextView = this.contextViewService.showContextView({
			getAnchor: () => this.element,
			render: container => {
				this.element.style.borderBottomLeftRadius = '0';
				this.element.style.borderBottomRightRadius = '0';

				const validationContainer = append(container, $('.scm-editor-validation-container'));
				validationContainer.classList.toggle('validation-info', this.validation!.type === InputValidationType.Information);
				validationContainer.classList.toggle('validation-warning', this.validation!.type === InputValidationType.Warning);
				validationContainer.classList.toggle('validation-error', this.validation!.type === InputValidationType.Error);
				validationContainer.style.width = `${this.element.clientWidth + 2}px`;
				const element = append(validationContainer, $('.scm-editor-validation'));

				const message = this.validation!.message;
				if (typeof message === 'string') {
					element.textContent = message;
				} else {
					const tracker = trackFocus(element);
					disposables.add(tracker);
					disposables.add(tracker.onDidFocus(() => (this.validationHasFocus = true)));
					disposables.add(tracker.onDidBlur(() => {
						this.validationHasFocus = false;
						this.element.style.borderBottomLeftRadius = '2px';
						this.element.style.borderBottomRightRadius = '2px';
						this.contextViewService.hideContextView();
					}));

					const renderedMarkdown = this.markdownRendererService.render(message, {
						actionHandler: (link, mdStr) => {
							openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
							this.element.style.borderBottomLeftRadius = '2px';
							this.element.style.borderBottomRightRadius = '2px';
							this.contextViewService.hideContextView();
						},
					});
					disposables.add(renderedMarkdown);
					element.appendChild(renderedMarkdown.element);
				}
				const actionsContainer = append(validationContainer, $('.scm-editor-validation-actions'));
				const actionbar = new ActionBar(actionsContainer);
				const action = new Action('scmInputWidget.validationMessage.close', localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
					this.contextViewService.hideContextView();
					this.element.style.borderBottomLeftRadius = '2px';
					this.element.style.borderBottomRightRadius = '2px';
				});
				disposables.add(actionbar);
				actionbar.push(action, { icon: true, label: false });

				return Disposable.None;
			},
			onHide: () => {
				this.validationHasFocus = false;
				this.element.style.borderBottomLeftRadius = '2px';
				this.element.style.borderBottomRightRadius = '2px';
				disposables.dispose();
			},
			anchorAlignment: AnchorAlignment.LEFT
		});
	}

	private getToolbarWidth(): number {
		const showInputActionButton = this.configurationService.getValue<boolean>('scm.showInputActionButton');
		if (!this.toolbar || !showInputActionButton || this.toolbar?.isEmpty() === true) {
			return 0;
		}

		return this.toolbar.dropdownActions.length === 0 ?
			26 /* 22px action + 4px margin */ :
			39 /* 35px action + 4px margin */;
	}

	clearValidation(): void {
		this.validationContextView?.close();
		this.validationContextView = undefined;
		this.validationHasFocus = false;
		this.validationMessageContextKey.set(false);
	}

	dispose(): void {
		this.input = undefined;
		this.repositoryDisposables.dispose();
		this.clearValidation();
		this.disposables.dispose();
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SCMInputWidgetCommandId.SetupAction,
			title: localize('scmInputGenerateCommitMessage', "Generate Commit Message"),
			icon: Codicon.sparkle,
			f1: false,
			menu: {
				id: MenuId.SCMInputBox,
				when: ContextKeyExpr.and(
					ChatContextKeys.Setup.hidden.negate(),
					ChatContextKeys.Setup.disabled.negate(),
					ChatContextKeys.Setup.installed.negate(),
					ContextKeyExpr.equals('scmProvider', 'git')
				)
			}
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const commandService = accessor.get(ICommandService);

		const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
		if (!result) {
			return;
		}

		const command = product.defaultChatAgent?.generateCommitMessageCommand;
		if (!command) {
			return;
		}

		await commandService.executeCommand(command, ...args);
	}
});

setupSimpleEditorSelectionStyling('.scm-view .scm-editor-container');
