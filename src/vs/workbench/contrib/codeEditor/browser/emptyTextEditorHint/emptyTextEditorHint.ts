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
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
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
import './emptyTextEditorHint.css';

export const emptyTextEditorHintSetting = 'workbench.editor.empty.hint';
export class EmptyTextEditorHintContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'editor.contrib.emptyTextEditorHint';

	private textHintContentWidget: EmptyTextEditorHintContentWidget | undefined;

	constructor(
		protected readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInlineChatSessionService private readonly inlineChatSessionService: IInlineChatSessionService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._register(this.editor.onDidChangeModel(() => this.update()));
		this._register(this.editor.onDidChangeModelLanguage(() => this.update()));
		this._register(this.editor.onDidChangeModelContent(() => this.update()));
		this._register(this.chatAgentService.onDidChangeAgents(() => this.update()));
		this._register(this.editor.onDidChangeModelDecorations(() => this.update()));
		this._register(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.readOnly)) {
				this.update();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(emptyTextEditorHintSetting)) {
				this.update();
			}
		}));
		this._register(inlineChatSessionService.onWillStartSession(editor => {
			if (this.editor === editor) {
				this.textHintContentWidget?.dispose();
			}
		}));
		this._register(inlineChatSessionService.onDidEndSession(e => {
			if (this.editor === e.editor) {
				this.update();
			}
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

		if (this.inlineChatSessionService.getSession(this.editor, model.uri)) {
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

	protected update(): void {
		const shouldRenderHint = this.shouldRenderHint();
		if (shouldRenderHint && !this.textHintContentWidget) {
			this.textHintContentWidget = this.instantiationService.createInstance(EmptyTextEditorHintContentWidget, this.editor);
		} else if (!shouldRenderHint && this.textHintContentWidget) {
			this.textHintContentWidget.dispose();
			this.textHintContentWidget = undefined;
		}
	}

	override dispose(): void {
		super.dispose();

		this.textHintContentWidget?.dispose();
	}
}

class EmptyTextEditorHintContentWidget extends Disposable implements IContentWidget {

	private static readonly ID = 'editor.widget.emptyHint';

	private domNode: HTMLElement | undefined;
	private isVisible = false;
	private ariaLabel: string = '';

	constructor(
		private readonly editor: ICodeEditor,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) {
		super();

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
	}

	getId(): string {
		return EmptyTextEditorHintContentWidget.ID;
	}

	private disableHint(e?: MouseEvent) {
		const disableHint = () => {
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

		const hintHandler: IContentActionHandler = {
			disposables: this._store,
			callback: (index, event) => {
				switch (index) {
					case '0':
						hasInlineChatProvider ? askSomething(event.browserEvent) : languageOnClickOrTap(event.browserEvent);
						break;
					case '1':
						hasInlineChatProvider ? languageOnClickOrTap(event.browserEvent) : this.disableHint();
						break;
					case '2':
						this.disableHint();
						break;
				}
			}
		};

		// the actual command handlers...
		const askSomethingCommandId = 'inlineChat.start';
		const askSomething = async (e: UIEvent) => {
			e.stopPropagation();
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: askSomethingCommandId,
				from: 'hint'
			});
			await this.commandService.executeCommand(askSomethingCommandId, { from: 'hint' });
		};
		const languageOnClickOrTap = async (e: UIEvent) => {
			e.stopPropagation();
			// Need to focus editor before so current editor becomes active and the command is properly executed
			this.editor.focus();
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: ChangeLanguageAction.ID,
				from: 'hint'
			});
			await this.commandService.executeCommand(ChangeLanguageAction.ID);
			this.editor.focus();
		};

		const keybindingsLookup = [askSomethingCommandId, ChangeLanguageAction.ID];
		const keybindingLabels = keybindingsLookup.map(id => this.keybindingService.lookupKeybinding(id)?.getLabel());

		const hintMsg = (hasInlineChatProvider ? localize({
			key: 'emptyTextEditorHintWithInlineChat',
			comment: [
				'Preserve double-square brackets and their order',
				'language refers to a programming language'
			]
		}, '[[Generate code]] ({0}), or [[select a language]] ({1}). Start typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(0) ?? '', keybindingLabels.at(1) ?? '') : localize({
			key: 'emptyTextEditorHintWithoutInlineChat',
			comment: [
				'Preserve double-square brackets and their order',
				'language refers to a programming language'
			]
		}, '[[Select a language]] ({0}) to get started. Start typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(1) ?? '')).replaceAll(' ()', '');
		const hintElement = renderFormattedText(hintMsg, {
			actionHandler: hintHandler,
			renderCodeSegments: false,
		});
		hintElement.style.fontStyle = 'italic';

		const ariaLabel = hasInlineChatProvider ?
			localize('defaultHintAriaLabelWithInlineChat', 'Execute {0} to ask a question, execute {1} to select a language and get started. Start typing to dismiss.', ...keybindingLabels) :
			localize('defaultHintAriaLabelWithoutInlineChat', 'Execute {0} to select a language and get started. Start typing to dismiss.', ...keybindingLabels);
		// eslint-disable-next-line no-restricted-syntax
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

registerEditorContribution(EmptyTextEditorHintContribution.ID, EmptyTextEditorHintContribution, EditorContributionInstantiation.Eager); // eager because it needs to render a help message
