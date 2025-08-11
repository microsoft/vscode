/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { count } from '../../../../../../base/common/strings.js';
import { isEmptyObject } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ElementSizeObserver } from '../../../../../../editor/browser/config/elementSizeObserver.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { IChatToolInvocation } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { createToolInputUri, createToolSchemaUri, ILanguageModelToolsService } from '../../../common/languageModelToolsService.js';
import { CancelChatActionId } from '../../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { renderFileWidgets } from '../../chatInlineAnchorWidget.js';
import { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatConfirmationWidget, ChatCustomConfirmationWidget, IChatConfirmationButton } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { IChatMarkdownAnchorService } from '../chatMarkdownAnchorService.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

const SHOW_MORE_MESSAGE_HEIGHT_TRIGGER = 30;

export class ToolConfirmationSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private markdownParts: ChatMarkdownContentPart[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownParts.flatMap(part => part.codeblocks);
	}

	constructor(
		toolInvocation: IChatToolInvocation,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IMarkerService private readonly markerService: IMarkerService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		super(toolInvocation);

		if (!toolInvocation.confirmationMessages) {
			throw new Error('Confirmation messages are missing');
		}
		const { title, message, allowAutoConfirm, disclaimer } = toolInvocation.confirmationMessages;
		const continueLabel = localize('continue', "Continue");
		const continueKeybinding = keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
		const continueTooltip = continueKeybinding ? `${continueLabel} (${continueKeybinding})` : continueLabel;
		const cancelLabel = localize('cancel', "Cancel");
		const cancelKeybinding = keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
		const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;

		const enum ConfirmationOutcome {
			Allow,
			Disallow,
			AllowWorkspace,
			AllowGlobally,
			AllowSession,
			CustomAction,
		}

		const buttons: IChatConfirmationButton[] = [
			{
				label: continueLabel,
				data: ConfirmationOutcome.Allow,
				tooltip: continueTooltip,
				moreActions: !allowAutoConfirm ? undefined : [
					{ label: localize('allowSession', 'Allow in this Session'), data: ConfirmationOutcome.AllowSession, tooltip: localize('allowSesssionTooltip', 'Allow this tool to run in this session without confirmation.') },
					{ label: localize('allowWorkspace', 'Allow in this Workspace'), data: ConfirmationOutcome.AllowWorkspace, tooltip: localize('allowWorkspaceTooltip', 'Allow this tool to run in this workspace without confirmation.') },
					{ label: localize('allowGlobally', 'Always Allow'), data: ConfirmationOutcome.AllowGlobally, tooltip: localize('allowGloballTooltip', 'Always allow this tool to run without confirmation.') },
				],
			},
			{
				label: localize('cancel', "Cancel"),
				data: ConfirmationOutcome.Disallow,
				isSecondary: true,
				tooltip: cancelTooltip
			}];

		let confirmWidget: ChatConfirmationWidget | ChatCustomConfirmationWidget;
		if (typeof message === 'string') {
			confirmWidget = this._register(this.instantiationService.createInstance(
				ChatConfirmationWidget,
				this.context.container,
				{ title, subtitle: toolInvocation.originMessage, buttons, message, toolbarData: { arg: toolInvocation, partType: 'chatToolConfirmation' } }
			));
		} else {
			const codeBlockRenderOptions: ICodeBlockRenderOptions = {
				hideToolbar: true,
				reserveWidth: 19,
				verticalPadding: 5,
				editorOptions: {
					tabFocusMode: true,
					ariaLabel: typeof title === 'string' ? title : title.value
				},
			};

			const elements = dom.h('div', [
				dom.h('.message@messageContainer', [
					dom.h('.message-wrapper@message'),
					dom.h('a.see-more@showMore'),
				]),
				dom.h('.editor@editor'),
				dom.h('.disclaimer@disclaimer'),
			]);

			if (toolInvocation.toolSpecificData?.kind === 'input' && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {

				const title = document.createElement('h3');
				title.textContent = localize('chat.input', "Input");
				elements.editor.appendChild(title);

				const inputData = toolInvocation.toolSpecificData;

				const codeBlockRenderOptions: ICodeBlockRenderOptions = {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'off',
						readOnly: false,
						ariaLabel: typeof toolInvocation.confirmationMessages.title === 'string' ? toolInvocation.confirmationMessages.title : toolInvocation.confirmationMessages.title.value
					}
				};

				const langId = this.languageService.getLanguageIdByLanguageName('json');
				const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
				const canSeeMore = count(rawJsonInput, '\n') > 2; // if more than one key:value
				const model = this._register(this.modelService.createModel(
					// View a single JSON line by default until they 'see more'
					rawJsonInput.replace(/\n */g, ' '),
					this.languageService.createById(langId),
					createToolInputUri(toolInvocation.toolId),
					true
				));

				const markerOwner = generateUuid();
				const schemaUri = createToolSchemaUri(toolInvocation.toolId);
				const validator = new RunOnceScheduler(async () => {

					const newMarker: IMarkerData[] = [];

					const result = await this.commandService.executeCommand('json.validate', schemaUri, model.getValue());
					for (const item of result) {
						if (item.range && item.message) {
							newMarker.push({
								severity: item.severity === 'Error' ? MarkerSeverity.Error : MarkerSeverity.Warning,
								message: item.message,
								startLineNumber: item.range[0].line + 1,
								startColumn: item.range[0].character + 1,
								endLineNumber: item.range[1].line + 1,
								endColumn: item.range[1].character + 1,
								code: item.code ? String(item.code) : undefined
							});
						}
					}

					this.markerService.changeOne(markerOwner, model.uri, newMarker);
				}, 500);

				validator.schedule();
				this._register(model.onDidChangeContent(() => validator.schedule()));
				this._register(toDisposable(() => this.markerService.remove(markerOwner, [model.uri])));
				this._register(validator);

				const editor = this._register(this.editorPool.get());
				editor.object.render({
					codeBlockIndex: this.codeBlockStartIndex,
					codeBlockPartIndex: 0,
					element: this.context.element,
					languageId: langId ?? 'json',
					renderOptions: codeBlockRenderOptions,
					textModel: Promise.resolve(model),
					chatSessionId: this.context.element.sessionId
				}, this.currentWidthDelegate());
				this.codeblocks.push({
					codeBlockIndex: this.codeBlockStartIndex,
					codemapperUri: undefined,
					elementId: this.context.element.id,
					focus: () => editor.object.focus(),
					isStreaming: false,
					ownerMarkdownPartId: this.codeblocksPartId,
					uri: model.uri,
					uriPromise: Promise.resolve(model.uri),
					chatSessionId: this.context.element.sessionId
				});
				this._register(editor.object.onDidChangeContentHeight(() => {
					editor.object.layout(this.currentWidthDelegate());
					this._onDidChangeHeight.fire();
				}));
				this._register(model.onDidChangeContent(e => {
					try {
						inputData.rawInput = JSON.parse(model.getValue());
					} catch {
						// ignore
					}
				}));

				elements.editor.append(editor.object.element);

				if (canSeeMore) {
					const seeMore = dom.h('div.see-more', [dom.h('a@link')]);
					seeMore.link.textContent = localize('seeMore', "See more");
					this._register(dom.addDisposableGenericMouseDownListener(seeMore.link, () => {
						try {
							const parsed = JSON.parse(model.getValue());
							model.setValue(JSON.stringify(parsed, null, 2));
							editor.object.editor.updateOptions({ tabFocusMode: false });
							editor.object.editor.updateOptions({ wordWrap: 'on' });
						} catch {
							// ignored
						}
						seeMore.root.remove();
					}));
					elements.editor.append(seeMore.root);
				}
			}

			this._makeMarkdownPart(elements.message, message, codeBlockRenderOptions);
			elements.showMore.textContent = localize('seeMore', "See more");

			const messageSeeMoreObserver = this._register(new ElementSizeObserver(elements.message, undefined));
			const updateSeeMoreDisplayed = () => {
				const show = messageSeeMoreObserver.getHeight() > SHOW_MORE_MESSAGE_HEIGHT_TRIGGER;
				if (elements.messageContainer.classList.contains('can-see-more') !== show) {
					elements.messageContainer.classList.toggle('can-see-more', show);
					this._onDidChangeHeight.fire();
				}
			};

			this._register(dom.addDisposableListener(elements.showMore, 'click', () => {
				elements.messageContainer.classList.toggle('can-see-more', false);
				this._onDidChangeHeight.fire();
				messageSeeMoreObserver.dispose();
			}));


			this._register(messageSeeMoreObserver.onDidChange(updateSeeMoreDisplayed));
			messageSeeMoreObserver.startObserving();

			if (disclaimer) {
				this._makeMarkdownPart(elements.disclaimer, disclaimer, codeBlockRenderOptions);
			} else {
				elements.disclaimer.remove();
			}

			confirmWidget = this._register(this.instantiationService.createInstance(
				ChatCustomConfirmationWidget,
				this.context.container,
				{ title, subtitle: toolInvocation.originMessage, buttons, message: elements.root, toolbarData: { arg: toolInvocation, partType: 'chatToolConfirmation' } },
			));
		}

		const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
		hasToolConfirmation.set(true);

		this._register(confirmWidget.onDidClick(button => {
			switch (button.data as ConfirmationOutcome) {
				case ConfirmationOutcome.AllowGlobally:
					this.languageModelToolsService.setToolAutoConfirmation(toolInvocation.toolId, 'profile', true);
					toolInvocation.confirmed.complete(true);
					break;
				case ConfirmationOutcome.AllowWorkspace:
					this.languageModelToolsService.setToolAutoConfirmation(toolInvocation.toolId, 'workspace', true);
					toolInvocation.confirmed.complete(true);
					break;
				case ConfirmationOutcome.AllowSession:
					this.languageModelToolsService.setToolAutoConfirmation(toolInvocation.toolId, 'memory', true);
					toolInvocation.confirmed.complete(true);
					break;
				case ConfirmationOutcome.Allow:
					toolInvocation.confirmed.complete(true);
					break;
				case ConfirmationOutcome.Disallow:
					toolInvocation.confirmed.complete(false);
					break;
			}

			this.chatWidgetService.getWidgetBySessionId(this.context.element.sessionId)?.focusInput();
		}));
		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._register(toDisposable(() => hasToolConfirmation.reset()));
		toolInvocation.confirmed.p.then(() => {
			hasToolConfirmation.reset();
			this._onNeedsRerender.fire();
		});
		this.domNode = confirmWidget.domNode;
	}

	private _makeMarkdownPart(container: HTMLElement, message: string | IMarkdownString, codeBlockRenderOptions: ICodeBlockRenderOptions) {
		const part = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart,
			{
				kind: 'markdownContent',
				content: typeof message === 'string' ? new MarkdownString().appendMarkdown(message) : message
			},
			this.context,
			this.editorPool,
			false,
			this.codeBlockStartIndex,
			this.renderer,
			undefined,
			this.currentWidthDelegate(),
			this.codeBlockModelCollection,
			{ codeBlockRenderOptions }
		));
		renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store);
		container.append(part.domNode);

		this._register(part.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
	}
}
