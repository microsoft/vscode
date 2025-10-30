/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { getExtensionForMimeType } from '../../../../../../base/common/mime.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatResponseResource } from '../../../common/chatModel.js';
import { IChatToolInvocation } from '../../../common/chatService.js';
import { ILanguageModelToolsService, IToolResultDataPart, IToolResultPromptTsxPart, IToolResultTextPart, stringifyPromptTsxPart } from '../../../common/languageModelToolsService.js';
import { AcceptToolPostConfirmationActionId, SkipToolPostConfirmationActionId } from '../../actions/chatToolActions.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { EditorPool } from '../chatMarkdownContentPart.js';
import { ChatCollapsibleIOPart } from '../chatToolInputOutputContentPart.js';
import { ChatToolOutputContentSubPart } from '../chatToolOutputContentSubPart.js';
import { AbstractToolConfirmationSubPart, ConfirmationOutcome } from './abstractToolConfirmationSubPart.js';

export class ChatToolPostExecuteConfirmationPart extends AbstractToolConfirmationSubPart {
	private _codeblocks: IChatCodeBlockInfo[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this._codeblocks;
	}

	constructor(
		toolInvocation: IChatToolInvocation,
		context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		private readonly currentWidthDelegate: () => number,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
	) {
		super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService);
		const subtitle = toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
		this.render({
			allowActionId: AcceptToolPostConfirmationActionId,
			skipActionId: SkipToolPostConfirmationActionId,
			allowLabel: localize('allow', "Allow"),
			skipLabel: localize('skip.post', 'Skip Results'),
			partType: 'chatToolPostConfirmation',
			subtitle: typeof subtitle === 'string' ? subtitle : subtitle?.value,
		});
	}

	protected createContentElement(): HTMLElement {
		if (this.toolInvocation.kind !== 'toolInvocation') {
			throw new Error('post-approval not supported for serialized data');
		}
		const state = this.toolInvocation.state.get();
		if (state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
			throw new Error('Tool invocation is not waiting for post-approval');
		}

		return this.createResultsDisplay(this.toolInvocation, state.contentForModel);
	}

	protected getTitle(): string {
		return localize('approveToolResult', "Approve Tool Result");
	}

	protected override additionalPrimaryActions() {
		const actions = super.additionalPrimaryActions();
		actions.push(
			{ label: localize('allowSession', 'Allow Without Review in this Session'), data: ConfirmationOutcome.AllowSession, tooltip: localize('allowSessionTooltip', 'Allow results from this tool to be sent without confirmation in this session.') },
			{ label: localize('allowWorkspace', 'Allow Without Review in this Workspace'), data: ConfirmationOutcome.AllowWorkspace, tooltip: localize('allowWorkspaceTooltip', 'Allow results from this tool to be sent without confirmation in this workspace.') },
			{ label: localize('allowGlobally', 'Always Allow Without Review'), data: ConfirmationOutcome.AllowGlobally, tooltip: localize('allowGloballyTooltip', 'Always allow results from this tool to be sent without confirmation.') },
		);

		return actions;
	}

	private createResultsDisplay(toolInvocation: IChatToolInvocation, contentForModel: (IToolResultPromptTsxPart | IToolResultTextPart | IToolResultDataPart)[]): HTMLElement {
		const container = dom.$('.tool-postconfirm-display');

		if (!contentForModel || contentForModel.length === 0) {
			container.textContent = localize('noResults', 'No results to display');
			return container;
		}

		const parts: ChatCollapsibleIOPart[] = [];

		for (const [i, part] of contentForModel.entries()) {
			if (part.kind === 'text') {
				// Display text parts
				const model = this._register(this.modelService.createModel(
					part.value,
					this.languageService.createById('plaintext'),
					undefined,
					true
				));

				parts.push({
					kind: 'code',
					textModel: model,
					languageId: model.getLanguageId(),
					options: {
						hideToolbar: true,
						reserveWidth: 19,
						maxHeightInLines: 13,
						verticalPadding: 5,
						editorOptions: { wordWrap: 'on', readOnly: true }
					},
					codeBlockInfo: {
						codeBlockIndex: i,
						codemapperUri: undefined,
						elementId: this.context.element.id,
						focus: () => { },
						ownerMarkdownPartId: this.codeblocksPartId,
						uri: model.uri,
						chatSessionId: this.context.element.sessionId,
						uriPromise: Promise.resolve(model.uri)
					}
				});
			} else if (part.kind === 'promptTsx') {
				// Display TSX parts as JSON-stringified
				const stringified = stringifyPromptTsxPart(part);
				const model = this._register(this.modelService.createModel(
					stringified,
					this.languageService.createById('json'),
					undefined,
					true
				));

				parts.push({
					kind: 'code',
					textModel: model,
					languageId: model.getLanguageId(),
					options: {
						hideToolbar: true,
						reserveWidth: 19,
						maxHeightInLines: 13,
						verticalPadding: 5,
						editorOptions: { wordWrap: 'on', readOnly: true }
					},
					codeBlockInfo: {
						codeBlockIndex: i,
						codemapperUri: undefined,
						elementId: this.context.element.id,
						focus: () => { },
						ownerMarkdownPartId: this.codeblocksPartId,
						uri: model.uri,
						chatSessionId: this.context.element.sessionId,
						uriPromise: Promise.resolve(model.uri)
					}
				});
			} else if (part.kind === 'data') {
				// Display data parts
				const mimeType = part.value.mimeType;
				const data = part.value.data;

				// Check if it's an image
				if (mimeType?.startsWith('image/')) {
					const permalinkBasename = getExtensionForMimeType(mimeType) ? `image${getExtensionForMimeType(mimeType)}` : 'image.bin';
					const permalinkUri = ChatResponseResource.createUri(this.context.element.sessionId, toolInvocation.toolCallId, i, permalinkBasename);
					parts.push({ kind: 'data', value: data.buffer, mimeType, uri: permalinkUri, audience: part.audience });
				} else {
					// Try to display as UTF-8 text, otherwise base64
					const decoder = new TextDecoder('utf-8', { fatal: true });
					try {
						const text = decoder.decode(data.buffer);
						const model = this._register(this.modelService.createModel(
							text,
							this.languageService.createById('plaintext'),
							undefined,
							true
						));

						parts.push({
							kind: 'code',
							textModel: model,
							languageId: model.getLanguageId(),
							options: {
								hideToolbar: true,
								reserveWidth: 19,
								maxHeightInLines: 13,
								verticalPadding: 5,
								editorOptions: { wordWrap: 'on', readOnly: true }
							},
							codeBlockInfo: {
								codeBlockIndex: i,
								codemapperUri: undefined,
								elementId: this.context.element.id,
								focus: () => { },
								ownerMarkdownPartId: this.codeblocksPartId,
								uri: model.uri,
								chatSessionId: this.context.element.sessionId,
								uriPromise: Promise.resolve(model.uri)
							}
						});
					} catch {
						// Not valid UTF-8, show base64
						const base64 = data.toString();
						const model = this._register(this.modelService.createModel(
							base64,
							this.languageService.createById('plaintext'),
							undefined,
							true
						));

						parts.push({
							kind: 'code',
							textModel: model,
							languageId: model.getLanguageId(),
							options: {
								hideToolbar: true,
								reserveWidth: 19,
								maxHeightInLines: 13,
								verticalPadding: 5,
								editorOptions: { wordWrap: 'on', readOnly: true }
							},
							codeBlockInfo: {
								codeBlockIndex: i,
								codemapperUri: undefined,
								elementId: this.context.element.id,
								focus: () => { },
								ownerMarkdownPartId: this.codeblocksPartId,
								uri: model.uri,
								chatSessionId: this.context.element.sessionId,
								uriPromise: Promise.resolve(model.uri)
							}
						});
					}
				}
			}
		}

		if (parts.length > 0) {
			const outputSubPart = this._register(this.instantiationService.createInstance(
				ChatToolOutputContentSubPart,
				this.context,
				this.editorPool,
				parts,
				this.currentWidthDelegate()
			));

			this._codeblocks.push(...outputSubPart.codeblocks);
			this._register(outputSubPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			outputSubPart.domNode.classList.add('tool-postconfirm-display');
			return outputSubPart.domNode;
		}

		container.textContent = localize('noDisplayableResults', 'No displayable results');
		return container;
	}
}
