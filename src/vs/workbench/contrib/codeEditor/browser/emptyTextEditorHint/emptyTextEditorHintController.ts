/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { IContentActionHandler, renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { LOG_MODE_ID, OUTPUT_MODE_ID } from '../../../../services/output/common/output.js';
import { SEARCH_RESULT_LANGUAGE_ID } from '../../../../services/search/common/search.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { IUntitledDocumentTelemetryService } from '../../../../services/untitled/common/untitledDocumentTelemetry.js';
import { EmptyTextEditorHintContributionId, IEmptyTextEditorHintContribution } from './emptyTextEditorHintTypes.js';
import { EmptyEditorHintActionsWidget, emptyEditorHintActionsSetting, IEmptyEditorHintActionsSize } from './emptyEditorHintActions.js';
import { canOpenInMarkdownEditor, EmptyEditorHintReopener, markdownEditorId } from './emptyEditorHintReopen.js';
import { EmptyEditorHintAction, EmptyEditorHintVariant, logEmptyEditorHintEvent } from './emptyTextEditorHintTelemetry.js';
import { IEditorResolverService } from '../../../../services/editor/common/editorResolverService.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import './emptyTextEditorHint.css';

export const emptyTextEditorHintSetting = 'workbench.editor.empty.hint';

export const emptyEditorHintOpenInMarkdownEditorSetting = 'workbench.editor.experimental.emptyEditorHintOpenInMarkdownEditor';

export class EmptyTextEditorHintContribution extends Disposable implements IEmptyTextEditorHintContribution {

	static readonly ID = EmptyTextEditorHintContributionId;

	private textHintContentWidget: EmptyTextEditorHintContentWidget | EmptyEditorHintActionsWidget | undefined;

	/** The text models for which the user closed the hint. Untitled URIs are reused, models are not; held weakly so disposed models are dropped. */
	private readonly closedForModels = new WeakSet<ITextModel>();

	/** Set while the editor is too small for the list of actions, so that the classic hint is shown until it grows. */
	private actionsRequiredSize: IEmptyEditorHintActionsSize | undefined;

	constructor(
		protected readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInlineChatSessionService private readonly inlineChatSessionService: IInlineChatSessionService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
	) {
		super();

		this._register(this.editor.onDidChangeModel(() => this.update()));
		this._register(this.editor.onDidChangeModelLanguage(() => this.update()));
		this._register(this.editor.onDidChangeModelContent(() => this.update()));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.update()));
		this._register(this.editorResolverService.onDidChangeEditorRegistrations(() => this.update()));
		this._register(this.editor.onDidChangeModelDecorations(() => this.update()));
		this._register(this.editor.onDidLayoutChange(() => {
			if (this.actionsRequiredSize) {
				this.update();
			}
		}));
		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.readOnly)) {
				this.update();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(emptyTextEditorHintSetting) || e.affectsConfiguration(emptyEditorHintActionsSetting) || e.affectsConfiguration(emptyEditorHintOpenInMarkdownEditorSetting)) {
				this.update();
			}
		}));
		this._register(inlineChatSessionService.onWillStartSession(editor => {
			if (this.editor === editor) {
				this.disposeHint();
			}
		}));
		this._register(inlineChatSessionService.onDidChangeSessions(() => {
			this.update();
		}));
	}

	protected shouldRenderHint() {
		const configValue = this.configurationService.getValue(emptyTextEditorHintSetting);
		if (configValue === 'hidden') {
			return false;
		}

		if (this.editor.getOption(EditorOption.readOnly)) {
			return false;
		}

		const model = this.editor.getModel();
		const languageId = model?.getLanguageId();
		if (!model || languageId === OUTPUT_MODE_ID || languageId === LOG_MODE_ID || languageId === SEARCH_RESULT_LANGUAGE_ID) {
			return false;
		}

		if (this.inlineChatSessionService.getSessionByTextModel(model.uri)) {
			return false;
		}

		if (this.closedForModels.has(model)) {
			return false;
		}

		if (this.editor.getModel()?.getValueLength()) {
			return false;
		}

		const hasConflictingDecorations = Boolean(this.editor.getLineDecorations(1)?.find((d) =>
			d.options.beforeContentClassName
			|| d.options.afterContentClassName
			|| d.options.before?.content
			|| d.options.after?.content
		));
		if (hasConflictingDecorations) {
			return false;
		}

		const hasEditorAgents = Boolean(this.chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
		const shouldRenderDefaultHint = model?.uri.scheme === Schemas.untitled && languageId === PLAINTEXT_LANGUAGE_ID;
		return hasEditorAgents || shouldRenderDefaultHint;
	}

	/**
	 * The list of actions is experimental and only offered for new untitled files, not in diff editors.
	 */
	private shouldRenderActions(): boolean {
		return this.isUntitledOutsideDiffEditor()
			&& this.configurationService.getValue<boolean>(emptyEditorHintActionsSetting) === true
			&& this.actionsFit();
	}

	private shouldOfferMarkdownEditor(): boolean {
		const model = this.editor.getModel();
		return !!model
			&& this.isUntitledOutsideDiffEditor()
			&& this.configurationService.getValue<boolean>(emptyEditorHintOpenInMarkdownEditorSetting) === true
			&& canOpenInMarkdownEditor(this.editorResolverService, model.uri);
	}

	private isUntitledOutsideDiffEditor(): boolean {
		return this.editor.getModel()?.uri.scheme === Schemas.untitled && !this.editor.getOption(EditorOption.inDiffEditor);
	}

	/**
	 * Whether the editor is large enough for the list of actions, after it did not fit before.
	 */
	private actionsFit(): boolean {
		if (!this.actionsRequiredSize) {
			return true;
		}
		const layoutInfo = this.editor.getLayoutInfo();
		return layoutInfo.width - layoutInfo.verticalScrollbarWidth >= this.actionsRequiredSize.width && layoutInfo.height >= this.actionsRequiredSize.height;
	}

	private getVariant(): EmptyEditorHintVariant | undefined {
		if (!this.shouldRenderHint()) {
			return undefined;
		}
		if (this.shouldRenderActions()) {
			return 'actions';
		}
		return this.shouldOfferMarkdownEditor() ? 'classicMarkdownEditor' : 'classic';
	}

	protected update(): void {
		const variant = this.getVariant();
		if (this.textHintContentWidget && this.textHintContentWidget.variant !== variant) {
			this.disposeHint();
		}
		if (variant && !this.textHintContentWidget) {
			this.textHintContentWidget = variant === 'actions' ? this.createActionsWidget() : undefined;
			// The list of actions falls back to the classic hint if it does not fit
			this.textHintContentWidget ??= this.instantiationService.createInstance(EmptyTextEditorHintContentWidget, this.editor, this.shouldOfferMarkdownEditor());
		}
	}

	/**
	 * Creates the list of actions, or returns `undefined` if it does not fit into the editor.
	 */
	private createActionsWidget(): EmptyEditorHintActionsWidget | undefined {
		const widget: EmptyEditorHintActionsWidget = this.instantiationService.createInstance(EmptyEditorHintActionsWidget, this.editor, {
			close: () => {
				const model = this.editor.getModel();
				if (model) {
					this.closedForModels.add(model);
				}
				this.disposeHint();
			},
			dontShowAgain: () => {
				this.configurationService.updateValue(emptyTextEditorHintSetting, 'hidden');
				this.disposeHint();
			},
			doesNotFit: () => {
				this.actionsRequiredSize = widget.requiredSize;
				this.update();
			},
		});
		if (!widget.fits) {
			this.actionsRequiredSize = widget.requiredSize;
			widget.dispose();
			return undefined;
		}
		this.actionsRequiredSize = undefined;
		return widget;
	}

	disposeHint(): void {
		this.textHintContentWidget?.dispose();
		this.textHintContentWidget = undefined;
	}

	/**
	 * Hides the list of actions for this editor (Escape in the editor).
	 */
	closeActionsHint(): void {
		if (this.textHintContentWidget instanceof EmptyEditorHintActionsWidget) {
			this.textHintContentWidget.close('closeEscape');
		}
	}

	override dispose(): void {
		super.dispose();

		this.disposeHint();
	}
}

/**
 * The classic hint: a single line with links, e.g. "Generate code (Ctrl+I), or select a language (Ctrl+K M)."
 */
export class EmptyTextEditorHintContentWidget extends Disposable implements IContentWidget {

	private static readonly ID = 'editor.widget.emptyHint';

	private domNode: HTMLElement | undefined;
	private isVisible = false;
	private ariaLabel: string = '';
	private readonly reopener: EmptyEditorHintReopener;

	readonly variant: EmptyEditorHintVariant;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly offerMarkdownEditor: boolean,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IUntitledDocumentTelemetryService private readonly untitledDocumentTelemetryService: IUntitledDocumentTelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.variant = offerMarkdownEditor ? 'classicMarkdownEditor' : 'classic';
		this.reopener = instantiationService.createInstance(EmptyEditorHintReopener, this.editor);
		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
		const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => undefined, 500);
		this._register(onDidFocusEditorText(() => {
			if (this.editor.hasTextFocus() && this.isVisible && this.ariaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
				status(this.ariaLabel);
			}
		}));
		this.editor.addContentWidget(this);
		this.logHintEvent('shown');
	}

	private logHintEvent(kind: 'shown' | 'action', action?: EmptyEditorHintAction): void {
		logEmptyEditorHintEvent(this.telemetryService, this.untitledDocumentTelemetryService, this.editor.getModel()?.uri, this.variant, kind, action);
	}

	getId(): string {
		return EmptyTextEditorHintContentWidget.ID;
	}

	private disableHint(e?: MouseEvent) {
		const disableHint = () => {
			this.logHintEvent('action', 'dontShowAgain');
			this.configurationService.updateValue(emptyTextEditorHintSetting, 'hidden');
			this.dispose();
			this.editor.focus();
		};

		if (!e) {
			disableHint();
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => { return new StandardMouseEvent(getActiveWindow(), e); },
			getActions: () => {
				return [{
					id: 'workench.action.disableEmptyEditorHint',
					label: localize('disableEditorEmptyHint', "Disable Empty Editor Hint"),
					tooltip: localize('disableEditorEmptyHint', "Disable Empty Editor Hint"),
					enabled: true,
					class: undefined,
					run: () => {
						disableHint();
					}
				}
				];
			}
		});
	}

	private getHint() {
		const hasInlineChatProvider = this.chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.EditorInline)).length > 0;

		// the actual command handlers...
		const askSomethingCommandId = 'inlineChat.start';
		const askSomething = async (e: UIEvent) => {
			e.stopPropagation();
			this.logHintEvent('action', 'generateCode');
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: askSomethingCommandId,
				from: 'hint'
			});
			await this.commandService.executeCommand(askSomethingCommandId, { from: 'hint' });
		};
		const languageOnClickOrTap = async (e: UIEvent) => {
			e.stopPropagation();
			this.logHintEvent('action', 'selectLanguage');
			// Need to focus editor before so current editor becomes active and the command is properly executed
			this.editor.focus();
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: ChangeLanguageAction.ID,
				from: 'hint'
			});
			await this.commandService.executeCommand(ChangeLanguageAction.ID);
			this.editor.focus();
		};
		const openInMarkdownEditor = async (e: UIEvent) => {
			e.stopPropagation();
			this.logHintEvent('action', 'openMarkdownEditor');
			// The reopen command works on the active editor, so make this editor the active one first
			this.editor.focus();
			await this.reopener.reopenWith(markdownEditorId);
		};

		// The handlers of the [[links]] of the message, in their order
		const linkHandlers: ((e: UIEvent) => void)[] = [
			...(hasInlineChatProvider ? [askSomething] : []),
			languageOnClickOrTap,
			...(this.offerMarkdownEditor ? [openInMarkdownEditor] : []),
			() => this.disableHint(),
		];
		const hintHandler: IContentActionHandler = {
			disposables: this._store,
			callback: (index, event) => linkHandlers[Number(index)]?.(event.browserEvent),
		};

		const keybindingsLookup = [askSomethingCommandId, ChangeLanguageAction.ID];
		const keybindingLabels = keybindingsLookup.map(id => this.keybindingService.lookupKeybinding(id)?.getLabel());

		const { message, ariaLabel } = getHintTexts(hasInlineChatProvider, this.offerMarkdownEditor, keybindingLabels.at(0), keybindingLabels.at(1));
		const hintElement = renderFormattedText(message, {
			actionHandler: hintHandler,
			renderCodeSegments: false,
		});
		hintElement.style.fontStyle = 'italic';

		// eslint-disable-next-line eslint-js/no-restricted-syntax
		for (const anchor of hintElement.querySelectorAll('a')) {
			anchor.style.cursor = 'pointer';
		}

		return { hintElement, ariaLabel };
	}

	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.empty-editor-hint');
			this.domNode.style.width = 'max-content';
			this.domNode.style.paddingLeft = '4px';

			const { hintElement, ariaLabel } = this.getHint();
			this.domNode.append(hintElement);
			this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.EmptyEditorHint));

			this._register(addDisposableListener(this.domNode, 'click', () => {
				this.editor.focus();
			}));

			this.editor.applyFontInfo(this.domNode);
			const lineHeight = this.editor.getLineHeightForPosition(new Position(1, 1));
			this.domNode.style.lineHeight = lineHeight + 'px';
		}

		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	override dispose(): void {
		super.dispose();

		this.editor.removeContentWidget(this);
	}
}

/**
 * The message of the classic hint, with its [[links]] in the order of their handlers, and its aria label.
 */
function getHintTexts(hasInlineChatProvider: boolean, offerMarkdownEditor: boolean, inlineChatKeybinding: string | null | undefined, languageKeybinding: string | null | undefined): { message: string; ariaLabel: string } {
	if (offerMarkdownEditor) {
		return hasInlineChatProvider ? {
			message: localize({ key: 'emptyTextEditorHintWithInlineChatAndMarkdownEditor', comment: ['Preserve double-square brackets and their order', 'language refers to a programming language', 'Markdown Editor is the name of an editor'] }, '[[Generate code]] ({0}), [[select a language]] ({1}), or [[open in Markdown Editor]]. Start typing to dismiss or [[don\'t show]] this again.', inlineChatKeybinding ?? '', languageKeybinding ?? '').replaceAll(' ()', ''),
			ariaLabel: localize('defaultHintAriaLabelWithInlineChatAndMarkdownEditor', 'Execute {0} to ask a question, execute {1} to select a language and get started, or open the file in the Markdown Editor. Start typing to dismiss.', inlineChatKeybinding, languageKeybinding),
		} : {
			message: localize({ key: 'emptyTextEditorHintWithMarkdownEditor', comment: ['Preserve double-square brackets and their order', 'language refers to a programming language', 'Markdown Editor is the name of an editor'] }, '[[Select a language]] ({0}) or [[open in Markdown Editor]] to get started. Start typing to dismiss or [[don\'t show]] this again.', languageKeybinding ?? '').replaceAll(' ()', ''),
			ariaLabel: localize('defaultHintAriaLabelWithMarkdownEditor', 'Execute {0} to select a language and get started, or open the file in the Markdown Editor. Start typing to dismiss.', languageKeybinding),
		};
	}
	return hasInlineChatProvider ? {
		message: localize({ key: 'emptyTextEditorHintWithInlineChat', comment: ['Preserve double-square brackets and their order', 'language refers to a programming language'] }, '[[Generate code]] ({0}), or [[select a language]] ({1}). Start typing to dismiss or [[don\'t show]] this again.', inlineChatKeybinding ?? '', languageKeybinding ?? '').replaceAll(' ()', ''),
		ariaLabel: localize('defaultHintAriaLabelWithInlineChat', 'Execute {0} to ask a question, execute {1} to select a language and get started. Start typing to dismiss.', inlineChatKeybinding, languageKeybinding),
	} : {
		message: localize({ key: 'emptyTextEditorHintWithoutInlineChat', comment: ['Preserve double-square brackets and their order', 'language refers to a programming language'] }, '[[Select a language]] ({0}) to get started. Start typing to dismiss or [[don\'t show]] this again.', languageKeybinding ?? '').replaceAll(' ()', ''),
		ariaLabel: localize('defaultHintAriaLabelWithoutInlineChat', 'Execute {0} to select a language and get started. Start typing to dismiss.', inlineChatKeybinding, languageKeybinding),
	};
}
