/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Separator } from '../../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { count } from '../../../../../../base/common/strings.js';
import { isEmptyObject } from '../../../../../../base/common/types.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ElementSizeObserver } from '../../../../../../editor/browser/config/elementSizeObserver.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { createToolInputUri, createToolSchemaUri, ILanguageModelToolsService } from '../../../common/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/languageModelToolsConfirmationService.js';
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from '../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { renderFileWidgets } from '../../chatInlineAnchorWidget.js';
import { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { IChatMarkdownAnchorService } from '../chatMarkdownAnchorService.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { AbstractToolConfirmationSubPart } from './abstractToolConfirmationSubPart.js';
import { EditorPool } from '../chatContentCodePools.js';

const SHOW_MORE_MESSAGE_HEIGHT_TRIGGER = 45;

export class ToolConfirmationSubPart extends AbstractToolConfirmationSubPart {
	private markdownParts: ChatMarkdownContentPart[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownParts.flatMap(part => part.codeblocks);
	}

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		private readonly renderer: IMarkdownRenderer,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IMarkerService private readonly markerService: IMarkerService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@ILanguageModelToolsConfirmationService private readonly confirmationService: ILanguageModelToolsConfirmationService,
	) {
		if (!toolInvocation.confirmationMessages?.title) {
			throw new Error('Confirmation messages are missing');
		}

		super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);

		this.render({
			allowActionId: AcceptToolConfirmationActionId,
			skipActionId: SkipToolConfirmationActionId,
			allowLabel: toolInvocation.confirmationMessages.confirmResults ? localize('allowReview', "Allow and Review") : localize('allow', "Allow"),
			skipLabel: localize('skip.detail', 'Proceed without running this tool'),
			partType: 'chatToolConfirmation',
			subtitle: typeof toolInvocation.originMessage === 'string' ? toolInvocation.originMessage : toolInvocation.originMessage?.value,
		});

		// Tag for sub-agent styling
		if (toolInvocation.fromSubAgent) {
			context.container.classList.add('from-sub-agent');
		}
	}

	protected override additionalPrimaryActions() {
		const actions = super.additionalPrimaryActions();
		if (this.toolInvocation.confirmationMessages?.allowAutoConfirm !== false) {
			// Get actions from confirmation service
			const confirmActions = this.confirmationService.getPreConfirmActions({
				toolId: this.toolInvocation.toolId,
				source: this.toolInvocation.source,
				parameters: this.toolInvocation.parameters
			});

			for (const action of confirmActions) {
				if (action.divider) {
					actions.push(new Separator());
				}
				actions.push({
					label: action.label,
					tooltip: action.detail,
					data: async () => {
						const shouldConfirm = await action.select();
						if (shouldConfirm) {
							this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
						}
					}
				});
			}
		}
		if (this.toolInvocation.confirmationMessages?.confirmResults) {
			actions.unshift(
				{
					label: localize('allowSkip', 'Allow and Skip Reviewing Result'),
					data: () => {
						this.toolInvocation.confirmationMessages!.confirmResults = undefined;
						this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
					}
				},
				new Separator(),
			);
		}

		return actions;
	}

	protected createContentElement(): HTMLElement | string {
		const { message, disclaimer } = this.toolInvocation.confirmationMessages!;
		const toolInvocation = this.toolInvocation as IChatToolInvocation;

		if (typeof message === 'string' && !disclaimer) {
			return message;
		} else {
			const codeBlockRenderOptions: ICodeBlockRenderOptions = {
				hideToolbar: true,
				reserveWidth: 19,
				verticalPadding: 5,
				editorOptions: {
					tabFocusMode: true,
					ariaLabel: this.getTitle(),
				},
			};

			const elements = dom.h('div', [
				dom.h('.message@messageContainer', [
					dom.h('.message-wrapper@message'),
					dom.h('.see-more@showMore', [
						dom.h('a', [localize('showMore', "Show More")])
					]),
				]),
				dom.h('.editor@editor'),
				dom.h('.disclaimer@disclaimer'),
			]);

			if (toolInvocation.toolSpecificData?.kind === 'input' && toolInvocation.toolSpecificData.rawInput && !isEmptyObject(toolInvocation.toolSpecificData.rawInput)) {

				const titleEl = document.createElement('h3');
				titleEl.textContent = localize('chat.input', "Input");
				elements.editor.appendChild(titleEl);

				const inputData = toolInvocation.toolSpecificData;

				const codeBlockRenderOptions: ICodeBlockRenderOptions = {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'off',
						readOnly: false,
						ariaLabel: this.getTitle(),
					}
				};

				const langId = this.languageService.getLanguageIdByLanguageName('json');
				const rawJsonInput = JSON.stringify(inputData.rawInput ?? {}, null, 1);
				const canSeeMore = count(rawJsonInput, '\n') > 2; // if more than one key:value
				const model = this._register(this.modelService.createModel(
					// View a single JSON line by default until they 'see more'
					rawJsonInput.replace(/\n */g, ' '),
					this.languageService.createById(langId),
					createToolInputUri(toolInvocation.toolCallId),
					true
				));

				const markerOwner = generateUuid();
				const schemaUri = createToolSchemaUri(toolInvocation.toolId);
				const validator = new RunOnceScheduler(async () => {

					const newMarker: IMarkerData[] = [];

					type JsonDiagnostic = {
						message: string;
						range: { line: number; character: number }[];
						severity: string;
						code?: string | number;
					};

					const result = await this.commandService.executeCommand<JsonDiagnostic[]>('json.validate', schemaUri, model.getValue());
					for (const item of result ?? []) {
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
					chatSessionResource: this.context.element.sessionResource
				}, this.currentWidthDelegate());
				this.codeblocks.push({
					codeBlockIndex: this.codeBlockStartIndex,
					codemapperUri: undefined,
					elementId: this.context.element.id,
					focus: () => editor.object.focus(),
					ownerMarkdownPartId: this.codeblocksPartId,
					uri: model.uri,
					uriPromise: Promise.resolve(model.uri),
					chatSessionResource: this.context.element.sessionResource
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

			const mdPart = this._makeMarkdownPart(elements.message, message!, codeBlockRenderOptions);

			const messageSeeMoreObserver = this._register(new ElementSizeObserver(mdPart.domNode, undefined));
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

			return elements.root;
		}
	}

	protected getTitle(): string {
		const { title } = this.toolInvocation.confirmationMessages!;
		return typeof title === 'string' ? title : title!.value;
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
			{ codeBlockRenderOptions },
		));
		renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store);
		container.append(part.domNode);

		this._register(part.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		return part;
	}
}
