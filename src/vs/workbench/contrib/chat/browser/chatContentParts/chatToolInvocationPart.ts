/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, thenIfNotDisposed, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorunWithStore } from '../../../../../base/common/observable.js';
import { count } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isEmptyObject } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Location } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatMarkdownContent, IChatProgressMessage, IChatTerminalToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { createToolInputUri, createToolSchemaUri, ILanguageModelToolsService, isToolResultInputOutputDetails, IToolResultInputOutputDetails } from '../../common/languageModelToolsService.js';
import { CancelChatActionId } from '../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../actions/chatToolActions.js';
import { ChatTreeItem, IChatCodeBlockInfo, IChatWidgetService } from '../chat.js';
import { getAttachableImageExtension } from '../chatAttachmentResolve.js';
import { ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ChatConfirmationWidget, ChatCustomConfirmationWidget, IChatConfirmationButton } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from './chatMarkdownContentPart.js';
import { ChatCustomProgressPart, ChatProgressContentPart } from './chatProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool, IChatCollapsibleListItem } from './chatReferencesContentPart.js';
import { ChatCollapsibleInputOutputContentPart, IChatCollapsibleIOCodePart, IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.subPart?.codeblocks ?? [];
	}

	public get codeblocksPartId(): string | undefined {
		return this.subPart?.codeblocksPartId;
	}

	private subPart!: ChatToolInvocationSubPart;

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		listPool: CollapsibleListPool,
		editorPool: EditorPool,
		currentWidthDelegate: () => number,
		codeBlockModelCollection: CodeBlockModelCollection,
		codeBlockStartIndex: number,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');
		if (toolInvocation.presentation === 'hidden') {
			return;
		}

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		const partStore = this._register(new DisposableStore());
		const render = () => {
			dom.clearNode(this.domNode);
			partStore.clear();

			this.subPart = partStore.add(instantiationService.createInstance(ChatToolInvocationSubPart, toolInvocation, context, renderer, listPool, editorPool, currentWidthDelegate, codeBlockModelCollection, codeBlockStartIndex));
			this.domNode.appendChild(this.subPart.domNode);
			partStore.add(this.subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			partStore.add(this.subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));
		};
		render();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return (other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized') && this.toolInvocation.toolCallId === other.toolCallId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatToolInvocationSubPart extends Disposable {
	private static idPool = 0;
	/** Remembers expanded tool parts on re-render */
	private static readonly _expandedByDefault = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

	private readonly _codeblocksPartId = 'tool-' + (ChatToolInvocationSubPart.idPool++);

	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private markdownPart: ChatMarkdownContentPart | undefined;
	private _codeblocks: IChatCodeBlockInfo[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		// TODO this is weird, the separate cases should maybe be their own "subparts"
		return this.markdownPart?.codeblocks ?? this._codeblocks;
	}

	public get codeblocksPartId(): string {
		return this.markdownPart?.codeblocksPartId ?? this._codeblocksPartId;
	}

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ICommandService private readonly commandService: ICommandService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		if (toolInvocation.kind === 'toolInvocation' && toolInvocation.confirmationMessages) {
			if (toolInvocation.toolSpecificData?.kind === 'terminal') {
				this.domNode = this.createTerminalConfirmationWidget(toolInvocation, toolInvocation.toolSpecificData);
			} else {
				this.domNode = this.createConfirmationWidget(toolInvocation);
			}
		} else if (toolInvocation.toolSpecificData?.kind === 'terminal') {
			this.domNode = this.createTerminalMarkdownProgressPart(toolInvocation, toolInvocation.toolSpecificData);
		} else if (Array.isArray(toolInvocation.resultDetails) && toolInvocation.resultDetails?.length) {
			this.domNode = this.createResultList(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage, toolInvocation.resultDetails);
		} else if (isToolResultInputOutputDetails(toolInvocation.resultDetails)) {
			this.domNode = this.createInputOutputMarkdownProgressPart(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage, toolInvocation.originMessage, toolInvocation.resultDetails.input, toolInvocation.resultDetails.output, !!toolInvocation.resultDetails.isError);
		} else if (toolInvocation.kind === 'toolInvocation' && toolInvocation.toolSpecificData?.kind === 'input' && !toolInvocation.isComplete) {
			this.domNode = this.createInputOutputMarkdownProgressPart(this.toolInvocation.invocationMessage, toolInvocation.originMessage, typeof toolInvocation.toolSpecificData.rawInput === 'string' ? toolInvocation.toolSpecificData.rawInput : JSON.stringify(toolInvocation.toolSpecificData.rawInput, null, 2), undefined, false);
		} else {
			this.domNode = this.createProgressPart();
		}

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompletePromise.then(() => this._onNeedsRerender.fire());
		}
	}

	private createConfirmationWidget(toolInvocation: IChatToolInvocation): HTMLElement {
		if (!toolInvocation.confirmationMessages) {
			throw new Error('Confirmation messages are missing');
		}
		const { title, message, allowAutoConfirm } = toolInvocation.confirmationMessages;
		const continueLabel = localize('continue', "Continue");
		const continueKeybinding = this.keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
		const continueTooltip = continueKeybinding ? `${continueLabel} (${continueKeybinding})` : continueLabel;
		const cancelLabel = localize('cancel', "Cancel");
		const cancelKeybinding = this.keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
		const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;

		const enum ConfirmationOutcome {
			Allow,
			Disallow,
			AllowWorkspace,
			AllowGlobally,
			AllowSession,
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
				title,
				toolInvocation.originMessage,
				message,
				buttons
			));
		} else {
			const chatMarkdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: message,
			};
			const codeBlockRenderOptions: ICodeBlockRenderOptions = {
				hideToolbar: true,
				reserveWidth: 19,
				verticalPadding: 5,
				editorOptions: {
					wordWrap: 'on'
				}
			};

			const elements = dom.h('div', [
				dom.h('.message@message'),
				dom.h('.editor@editor'),
			]);

			if (toolInvocation.toolSpecificData?.kind === 'input' && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {

				const inputData = toolInvocation.toolSpecificData;

				const codeBlockRenderOptions: ICodeBlockRenderOptions = {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'off',
						readOnly: false
					}
				};

				const langId = this.languageService.getLanguageIdByLanguageName('json');
				const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
				const canSeeMore = count(rawJsonInput, '\n') > 2; // if more than one key:value
				const model = this._register(this.modelService.createModel(
					// View a single JSON line by default until they 'see more'
					rawJsonInput.replace(/\n */g, ' '),
					this.languageService.createById(langId),
					createToolInputUri(toolInvocation.toolId)
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
				this._codeblocks.push({
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
							editor.object.editor.updateOptions({ wordWrap: 'on' });
						} catch {
							// ignored
						}
						seeMore.root.remove();
					}));
					elements.editor.append(seeMore.root);
				}
			}

			this.markdownPart = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, this.currentWidthDelegate(), this.codeBlockModelCollection, { codeBlockRenderOptions }));
			elements.message.append(this.markdownPart.domNode);

			this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			confirmWidget = this._register(this.instantiationService.createInstance(
				ChatCustomConfirmationWidget,
				title,
				toolInvocation.originMessage,
				elements.root,
				buttons
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
		return confirmWidget.domNode;
	}

	private createTerminalConfirmationWidget(toolInvocation: IChatToolInvocation, terminalData: IChatTerminalToolInvocationData): HTMLElement {
		if (!toolInvocation.confirmationMessages) {
			throw new Error('Confirmation messages are missing');
		}
		const title = toolInvocation.confirmationMessages.title;
		const message = toolInvocation.confirmationMessages.message;
		const continueLabel = localize('continue', "Continue");
		const continueKeybinding = this.keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
		const continueTooltip = continueKeybinding ? `${continueLabel} (${continueKeybinding})` : continueLabel;
		const cancelLabel = localize('cancel', "Cancel");
		const cancelKeybinding = this.keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
		const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;

		const buttons: IChatConfirmationButton[] = [
			{
				label: continueLabel,
				data: true,
				tooltip: continueTooltip
			},
			{
				label: cancelLabel,
				data: false,
				isSecondary: true,
				tooltip: cancelTooltip
			}];
		const renderedMessage = this._register(this.renderer.render(
			typeof message === 'string' ? new MarkdownString(message) : message,
			{ asyncRenderCallback: () => this._onDidChangeHeight.fire() }
		));
		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on',
				readOnly: false
			}
		};
		const langId = this.languageService.getLanguageIdByLanguageName(terminalData.language ?? 'sh') ?? 'shellscript';
		const model = this.modelService.createModel(terminalData.command, this.languageService.createById(langId));
		const editor = this._register(this.editorPool.get());
		const renderPromise = editor.object.render({
			codeBlockIndex: this.codeBlockStartIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			languageId: langId,
			renderOptions: codeBlockRenderOptions,
			textModel: Promise.resolve(model),
			chatSessionId: this.context.element.sessionId
		}, this.currentWidthDelegate());
		this._register(thenIfNotDisposed(renderPromise, () => this._onDidChangeHeight.fire()));
		this._codeblocks.push({
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
			terminalData.command = model.getValue();
		}));
		const element = dom.$('');
		dom.append(element, editor.object.element);
		dom.append(element, renderedMessage.element);
		const confirmWidget = this._register(this.instantiationService.createInstance(
			ChatCustomConfirmationWidget,
			title,
			undefined,
			element,
			buttons
		));

		ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService).set(true);
		this._register(confirmWidget.onDidClick(button => {
			toolInvocation.confirmed.complete(button.data);
			this.chatWidgetService.getWidgetBySessionId(this.context.element.sessionId)?.focusInput();
		}));
		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		toolInvocation.confirmed.p.then(() => {
			ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService).set(false);
			this._onNeedsRerender.fire();
		});
		return confirmWidget.domNode;
	}

	private createProgressPart(): HTMLElement {
		if (this.toolInvocation.isComplete && this.toolInvocation.isConfirmed !== false && this.toolInvocation.pastTenseMessage) {
			const part = this.renderProgressContent(this.toolInvocation.pastTenseMessage);
			this._register(part);
			return part.domNode;
		} else {
			const container = document.createElement('div');
			const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.progress : undefined;
			this._register(autorunWithStore((reader, store) => {
				const progress = progressObservable?.read(reader);
				const part = store.add(this.renderProgressContent(progress?.message || this.toolInvocation.invocationMessage));
				dom.reset(container, part.domNode);
			}));
			return container;
		}
	}

	private renderProgressContent(content: IMarkdownString | string) {
		if (typeof content === 'string') {
			content = new MarkdownString().appendText(content);
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};

		const iconOverride = !this.toolInvocation.isConfirmed ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : undefined;
		return this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, iconOverride);
	}

	private createTerminalMarkdownProgressPart(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, terminalData: IChatTerminalToolInvocationData): HTMLElement {
		const content = new MarkdownString(`\`\`\`${terminalData.language}\n${terminalData.command}\n\`\`\``);
		const chatMarkdownContent: IChatMarkdownContent = {
			kind: 'markdownContent',
			content: content as IMarkdownString,
		};

		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on'
			}
		};
		this.markdownPart = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, this.currentWidthDelegate(), this.codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		const icon = !this.toolInvocation.isConfirmed ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
		const progressPart = this.instantiationService.createInstance(ChatCustomProgressPart, this.markdownPart.domNode, icon);
		return progressPart.domNode;
	}

	private createInputOutputMarkdownProgressPart(message: string | IMarkdownString, subtitle: string | IMarkdownString | undefined, input: string, output: IToolResultInputOutputDetails['output'] | undefined, isError: boolean): HTMLElement {
		let codeBlockIndex = this.codeBlockStartIndex;
		const toCodePart = (data: string): IChatCollapsibleIOCodePart => {
			const model = this._register(this.modelService.createModel(
				data,
				this.languageService.createById('json')
			));

			return {
				kind: 'code',
				textModel: model,
				languageId: model.getLanguageId(),
				options: {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'on'
					}
				},
				codeBlockInfo: {
					codeBlockIndex: codeBlockIndex++,
					codemapperUri: undefined,
					elementId: this.context.element.id,
					focus: () => { },
					isStreaming: false,
					ownerMarkdownPartId: this.codeblocksPartId,
					uri: model.uri,
					chatSessionId: this.context.element.sessionId,
					uriPromise: Promise.resolve(model.uri)
				}
			};
		};

		if (typeof output === 'string') { // back compat with older stored versions
			output = [{ type: 'text', value: output }];
		}

		const collapsibleListPart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			this.context,
			this.editorPool,
			toCodePart(input),
			output && {
				parts: output.map((o): IChatCollapsibleIODataPart | IChatCollapsibleIOCodePart => {
					if (o.type === 'data') {
						const decoded = decodeBase64(o.value64).buffer;
						if (getAttachableImageExtension(o.mimeType)) {
							return { kind: 'data', value: decoded, mimeType: o.mimeType };
						} else {
							return toCodePart(localize('toolResultData', "Data of type {0} ({1} bytes)", o.mimeType, decoded.byteLength));
						}
					} else if (o.type === 'text') {
						return toCodePart(o.value);
					} else {
						assertNever(o);
					}
				}),
			},
			isError,
			ChatToolInvocationSubPart._expandedByDefault.get(this.toolInvocation) ?? false,
		));
		this._codeblocks.push(...collapsibleListPart.codeblocks);
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._register(toDisposable(() => ChatToolInvocationSubPart._expandedByDefault.set(this.toolInvocation, collapsibleListPart.expanded)));

		const progressObservable = this.toolInvocation.kind === 'toolInvocation' ? this.toolInvocation.progress : undefined;
		if (progressObservable) {
			this._register(autorunWithStore((reader, store) => {
				const progress = progressObservable?.read(reader);
				if (progress.message) {
					collapsibleListPart.title = progress.message;
				}
			}));
		}

		return collapsibleListPart.domNode;
	}

	private createResultList(
		message: string | IMarkdownString,
		toolDetails: Array<URI | Location>,
	): HTMLElement {
		const collapsibleListPart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleListContentPart,
			toolDetails.map<IChatCollapsibleListItem>(detail => ({
				kind: 'reference',
				reference: detail,
			})),
			message,
			this.context,
			this.listPool,
		));
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		return collapsibleListPart.domNode;
	}
}
