/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './emptyTextEditorHint.css';
import { $, addDisposableListener, getActiveWindow } from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../../nls.js';
import { ChangeLanguageAction } from '../../../../browser/parts/editor/editorStatus.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { IEditorContribution } from '../../../../../editor/common/editorCommon.js';
import { Schemas } from '../../../../../base/common/network.js';
import { Event } from '../../../../../base/common/event.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IContentActionHandler, renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { ApplyFileSnippetAction } from '../../../snippets/browser/commands/fileTemplateSnippets.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { LOG_MODE_ID, OUTPUT_MODE_ID } from '../../../../services/output/common/output.js';
import { SEARCH_RESULT_LANGUAGE_ID } from '../../../../services/search/common/search.js';
import { IChatAgentService } from '../../../chat/common/chatAgents.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

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

		const hasEditorAgents = Boolean(this.chatAgentService.getDefaultAgent(ChatAgentLocation.Editor));
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
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
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
		const hasInlineChatProvider = this.chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.Editor)).length > 0;

		const hintHandler: IContentActionHandler = {
			disposables: this._store,
			callback: (index, event) => {
				switch (index) {
					case '0':
						hasInlineChatProvider ? askSomething(event.browserEvent) : languageOnClickOrTap(event.browserEvent);
						break;
					case '1':
						hasInlineChatProvider ? languageOnClickOrTap(event.browserEvent) : snippetOnClickOrTap(event.browserEvent);
						break;
					case '2':
						hasInlineChatProvider ? snippetOnClickOrTap(event.browserEvent) : chooseEditorOnClickOrTap(event.browserEvent);
						break;
					case '3':
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

		const snippetOnClickOrTap = async (e: UIEvent) => {
			e.stopPropagation();

			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: ApplyFileSnippetAction.Id,
				from: 'hint'
			});
			await this.commandService.executeCommand(ApplyFileSnippetAction.Id);
		};

		const chooseEditorOnClickOrTap = async (e: UIEvent) => {
			e.stopPropagation();

			const activeEditorInput = this.editorGroupsService.activeGroup.activeEditor;
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'welcome.showNewFileEntries',
				from: 'hint'
			});
			const newEditorSelected = await this.commandService.executeCommand('welcome.showNewFileEntries', { from: 'hint' });

			// Close the active editor as long as it is untitled (swap the editors out)
			if (newEditorSelected && activeEditorInput !== null && activeEditorInput.resource?.scheme === Schemas.untitled) {
				this.editorGroupsService.activeGroup.closeEditor(activeEditorInput, { preserveFocus: true });
			}
		};

		const keybindingsLookup = hasInlineChatProvider ? [askSomethingCommandId, ChangeLanguageAction.ID, ApplyFileSnippetAction.Id] : [ChangeLanguageAction.ID, ApplyFileSnippetAction.Id, 'welcome.showNewFileEntries'];
		const keybindingLabels = keybindingsLookup.map(id => this.keybindingService.lookupKeybinding(id)?.getLabel());

		const hintMsg = (hasInlineChatProvider ? localize({
			key: 'emptyTextEditorHintWithInlineChat',
			comment: [
				'Preserve double-square brackets and their order',
				'language refers to a programming language'
			]
		}, '[[Open chat]] ({0}), or [[select a language]] ({1}), or [[fill with template]] ({2}) to get started.\nStart typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(0) ?? '', keybindingLabels.at(1) ?? '', keybindingLabels.at(2) ?? '') : localize({
			key: 'emptyTextEditorHintWithoutInlineChat',
			comment: [
				'Preserve double-square brackets and their order',
				'language refers to a programming language'
			]
		}, '[[Select a language]] ({0}), or [[fill with template]] ({1}), or [[open a different editor]] ({2}) to get started.\nStart typing to dismiss or [[don\'t show]] this again.', keybindingLabels.at(0) ?? '', keybindingLabels.at(1) ?? '', keybindingLabels.at(2) ?? '')).replaceAll('()', '');
		const hintElement = renderFormattedText(hintMsg, {
			actionHandler: hintHandler,
			renderCodeSegments: false,
		});
		hintElement.style.fontStyle = 'italic';

		const ariaLabel = hasInlineChatProvider ?
			localize('defaultHintAriaLabelWithInlineChat', 'Execute {0} to ask a question, execute {1} to select a language, or execute {2} to fill with template and get started. Start typing to dismiss.', ...keybindingLabels) :
			localize('defaultHintAriaLabelWithoutInlineChat', 'Execute {0} to select a language, execute {1} to fill with template, or execute {2} to open a different editor and get started. Start typing to dismiss.', ...keybindingLabels);
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
