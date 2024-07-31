/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./emptyTextEditorHint';
import * as dom from 'vs/base/browser/dom';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { localize } from 'vs/nls';
import { ChangeLanguageAction } from 'vs/workbench/browser/parts/editor/editorStatus';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { Schemas } from 'vs/base/common/network';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IContentActionHandler, renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { ApplyFileSnippetAction } from 'vs/workbench/contrib/snippets/browser/commands/fileTemplateSnippets';
import { IInlineChatSessionService } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSessionService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { IProductService } from 'vs/platform/product/common/productService';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { OS } from 'vs/base/common/platform';
import { status } from 'vs/base/browser/ui/aria/aria';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { LOG_MODE_ID, OUTPUT_MODE_ID } from 'vs/workbench/services/output/common/output';
import { SEARCH_RESULT_LANGUAGE_ID } from 'vs/workbench/services/search/common/search';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { ChatAgentLocation, IChatAgent, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

const $ = dom.$;

export interface IEmptyTextEditorHintOptions {
	readonly clickable?: boolean;
}

export const emptyTextEditorHintSetting = 'workbench.editor.empty.hint';
export class EmptyTextEditorHintContribution implements IEditorContribution {

	public static readonly ID = 'editor.contrib.emptyTextEditorHint';

	protected toDispose: IDisposable[];
	private textHintContentWidget: EmptyTextEditorHintContentWidget | undefined;

	constructor(
		protected readonly editor: ICodeEditor,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IHoverService protected readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInlineChatSessionService private readonly inlineChatSessionService: IInlineChatSessionService,
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService protected readonly productService: IProductService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		this.toDispose = [];
		this.toDispose.push(this.editor.onDidChangeModel(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelLanguage(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelContent(() => this.update()));
		this.toDispose.push(this.chatAgentService.onDidChangeAgents(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.update()));
		this.toDispose.push(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.readOnly)) {
				this.update();
			}
		}));
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(emptyTextEditorHintSetting)) {
				this.update();
			}
		}));
		this.toDispose.push(inlineChatSessionService.onWillStartSession(editor => {
			if (this.editor === editor) {
				this.textHintContentWidget?.dispose();
			}
		}));
		this.toDispose.push(inlineChatSessionService.onDidEndSession(e => {
			if (this.editor === e.editor) {
				this.update();
			}
		}));
	}

	protected _getOptions(): IEmptyTextEditorHintOptions {
		return { clickable: true };
	}

	protected _shouldRenderHint() {
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
		const shouldRenderHint = this._shouldRenderHint();
		if (shouldRenderHint && !this.textHintContentWidget) {
			this.textHintContentWidget = new EmptyTextEditorHintContentWidget(
				this.editor,
				this._getOptions(),
				this.editorGroupsService,
				this.commandService,
				this.configurationService,
				this.hoverService,
				this.keybindingService,
				this.chatAgentService,
				this.telemetryService,
				this.productService,
				this.contextMenuService
			);
		} else if (!shouldRenderHint && this.textHintContentWidget) {
			this.textHintContentWidget.dispose();
			this.textHintContentWidget = undefined;
		}
	}

	dispose(): void {
		dispose(this.toDispose);
		this.textHintContentWidget?.dispose();
	}
}

class EmptyTextEditorHintContentWidget implements IContentWidget {

	private static readonly ID = 'editor.widget.emptyHint';

	private domNode: HTMLElement | undefined;
	private readonly toDispose: DisposableStore;
	private isVisible = false;
	private ariaLabel: string = '';

	constructor(
		private readonly editor: ICodeEditor,
		private readonly options: IEmptyTextEditorHintOptions,
		private readonly editorGroupsService: IEditorGroupsService,
		private readonly commandService: ICommandService,
		private readonly configurationService: IConfigurationService,
		private readonly hoverService: IHoverService,
		private readonly keybindingService: IKeybindingService,
		private readonly chatAgentService: IChatAgentService,
		private readonly telemetryService: ITelemetryService,
		private readonly productService: IProductService,
		private readonly contextMenuService: IContextMenuService,
	) {
		this.toDispose = new DisposableStore();
		this.toDispose.add(this.editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
				this.editor.applyFontInfo(this.domNode);
			}
		}));
		const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => undefined, 500);
		this.toDispose.add(onDidFocusEditorText(() => {
			if (this.editor.hasTextFocus() && this.isVisible && this.ariaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
				status(this.ariaLabel);
			}
		}));
		this.editor.addContentWidget(this);
	}

	getId(): string {
		return EmptyTextEditorHintContentWidget.ID;
	}

	private _disableHint(e?: MouseEvent) {
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
			getAnchor: () => { return new StandardMouseEvent(dom.getActiveWindow(), e); },
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

	private _getHintInlineChat(providers: IChatAgent[]) {
		const providerName = (providers.length === 1 ? providers[0].fullName : undefined) ?? this.productService.nameShort;

		const inlineChatId = 'inlineChat.start';
		let ariaLabel = `Ask ${providerName} something or start typing to dismiss.`;

		const handleClick = () => {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'inlineChat.hintAction',
				from: 'hint'
			});
			this.commandService.executeCommand(inlineChatId, { from: 'hint' });
		};

		const hintHandler: IContentActionHandler = {
			disposables: this.toDispose,
			callback: (index, _event) => {
				switch (index) {
					case '0':
						handleClick();
						break;
				}
			}
		};

		const hintElement = $('empty-hint-text');
		hintElement.style.display = 'block';

		const keybindingHint = this.keybindingService.lookupKeybinding(inlineChatId);
		const keybindingHintLabel = keybindingHint?.getLabel();

		if (keybindingHint && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Press {0} to ask {1} to do something. ', keybindingHintLabel, providerName);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				if (this.options.clickable) {
					const hintPart = $('a', undefined, fragment);
					hintPart.style.fontStyle = 'italic';
					hintPart.style.cursor = 'pointer';
					this.toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CONTEXT_MENU, (e) => this._disableHint(e)));
					this.toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CLICK, handleClick));
					return hintPart;
				} else {
					const hintPart = $('span', undefined, fragment);
					hintPart.style.fontStyle = 'italic';
					return hintPart;
				}
			});

			hintElement.appendChild(before);

			const label = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
			label.set(keybindingHint);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			if (this.options.clickable) {
				label.element.style.cursor = 'pointer';
				this.toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CONTEXT_MENU, (e) => this._disableHint(e)));
				this.toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, handleClick));
			}

			hintElement.appendChild(after);

			const typeToDismiss = localize('emptyHintTextDismiss', 'Start typing to dismiss.');
			const textHint2 = $('span', undefined, typeToDismiss);
			textHint2.style.fontStyle = 'italic';
			hintElement.appendChild(textHint2);

			ariaLabel = actionPart.concat(typeToDismiss);
		} else {
			const hintMsg = localize({
				key: 'inlineChatHint',
				comment: [
					'Preserve double-square brackets and their order',
				]
			}, '[[Ask {0} to do something]] or start typing to dismiss.', providerName);
			const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
			hintElement.appendChild(rendered);
		}

		return { ariaLabel, hintElement };
	}

	private _getHintDefault() {
		const hintHandler: IContentActionHandler = {
			disposables: this.toDispose,
			callback: (index, event) => {
				switch (index) {
					case '0':
						languageOnClickOrTap(event.browserEvent);
						break;
					case '1':
						snippetOnClickOrTap(event.browserEvent);
						break;
					case '2':
						chooseEditorOnClickOrTap(event.browserEvent);
						break;
					case '3':
						this._disableHint();
						break;
				}
			}
		};

		// the actual command handlers...
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

		const hintMsg = localize({
			key: 'message',
			comment: [
				'Preserve double-square brackets and their order',
				'language refers to a programming language'
			]
		}, '[[Select a language]], or [[fill with template]], or [[open a different editor]] to get started.\nStart typing to dismiss or [[don\'t show]] this again.');
		const hintElement = renderFormattedText(hintMsg, {
			actionHandler: hintHandler,
			renderCodeSegments: false,
		});
		hintElement.style.fontStyle = 'italic';

		// ugly way to associate keybindings...
		const keybindingsLookup = [ChangeLanguageAction.ID, ApplyFileSnippetAction.Id, 'welcome.showNewFileEntries'];
		const keybindingLabels = keybindingsLookup.map((id) => this.keybindingService.lookupKeybinding(id)?.getLabel() ?? id);
		const ariaLabel = localize('defaultHintAriaLabel', 'Execute {0} to select a language, execute {1} to fill with template, or execute {2} to open a different editor and get started. Start typing to dismiss.', ...keybindingLabels);
		for (const anchor of hintElement.querySelectorAll('a')) {
			anchor.style.cursor = 'pointer';
			const id = keybindingsLookup.shift();
			const title = id && this.keybindingService.lookupKeybinding(id)?.getLabel();
			hintHandler.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), anchor, title ?? ''));
		}

		return { hintElement, ariaLabel };
	}

	getDomNode(): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.empty-editor-hint');
			this.domNode.style.width = 'max-content';
			this.domNode.style.paddingLeft = '4px';

			const inlineChatProviders = this.chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.Editor));
			const { hintElement, ariaLabel } = !inlineChatProviders.length ? this._getHintDefault() : this._getHintInlineChat(inlineChatProviders);
			this.domNode.append(hintElement);
			this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.EmptyEditorHint));

			this.toDispose.add(dom.addDisposableListener(this.domNode, 'click', () => {
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

	dispose(): void {
		this.editor.removeContentWidget(this);
		dispose(this.toDispose);
	}
}

registerEditorContribution(EmptyTextEditorHintContribution.ID, EmptyTextEditorHintContribution, EditorContributionInstantiation.Eager); // eager because it needs to render a help message
