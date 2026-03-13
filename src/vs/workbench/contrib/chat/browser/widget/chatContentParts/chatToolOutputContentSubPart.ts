/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { CodeBlockPart, ICodeBlockData } from './codeBlockPart.js';
import { IDisposableReference } from './chatCollections.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatCollapsibleIOPart, IChatCollapsibleIOCodePart, IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';
import { ChatResourceGroupWidget } from './chatResourceGroupWidget.js';

/**
 * A reusable component for rendering tool output consisting of code blocks and/or resources.
 * This is used by both ChatCollapsibleInputOutputContentPart and ChatToolPostExecuteConfirmationPart.
 */
export class ChatToolOutputContentSubPart extends Disposable {
	private readonly _editorReferences: IDisposableReference<CodeBlockPart>[] = [];
	public readonly domNode: HTMLElement;
	readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		private readonly context: IChatContentPartRenderContext,
		private readonly parts: ChatCollapsibleIOPart[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this.domNode = this.createOutputContents();
	}

	private toMdString(value: string | IMarkdownString): MarkdownString {
		if (typeof value === 'string') {
			return new MarkdownString('').appendText(value);
		}
		return new MarkdownString(value.value, { isTrusted: value.isTrusted });
	}

	private createOutputContents(): HTMLElement {
		const container = dom.$('div');

		for (let i = 0; i < this.parts.length; i++) {
			const part = this.parts[i];
			if (part.kind === 'code') {
				// Collect adjacent code parts and combine their contents
				const codeParts = [part];
				while (i + 1 < this.parts.length && this.parts[i + 1].kind === 'code') {
					codeParts.push(this.parts[++i] as IChatCollapsibleIOCodePart);
				}
				this.addCodeBlock(codeParts, container);
				continue;
			}

			const group: IChatCollapsibleIODataPart[] = [];
			for (let k = i; k < this.parts.length; k++) {
				const part = this.parts[k];
				if (part.kind !== 'data') {
					break;
				}
				group.push(part);
			}

			this.addResourceGroup(group, container);
			i += group.length - 1; // Skip the parts we just added
		}

		return container;
	}

	private addResourceGroup(parts: IChatCollapsibleIODataPart[], container: HTMLElement) {
		const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, parts));
		container.appendChild(widget.domNode);
	}

	private addCodeBlock(parts: IChatCollapsibleIOCodePart[], container: HTMLElement): void {
		const firstPart = parts[0];
		if (firstPart.title) {
			const title = dom.$('div.chat-confirmation-widget-title');
			const renderedTitle = this._register(this._markdownRendererService.render(this.toMdString(firstPart.title)));
			title.appendChild(renderedTitle.element);
			container.appendChild(title);
		}

		// Combine text from all adjacent code parts and create model lazily
		const combinedText = parts.map(p => p.data).join('\n');
		const textModel = this._register(this.modelService.createModel(
			combinedText,
			this.languageService.createById(firstPart.languageId),
			undefined,
			true
		));

		const data: ICodeBlockData = {
			languageId: firstPart.languageId,
			textModel: Promise.resolve(textModel),
			codeBlockIndex: firstPart.codeBlockIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: firstPart.options,
			chatSessionResource: this.context.element.sessionResource,
		};
		const editorReference = this._register(this.context.editorPool.get());
		editorReference.object.render(data, this.context.currentWidth.get());
		container.appendChild(editorReference.object.element);
		this._editorReferences.push(editorReference);

		// Track the codeblock
		this.codeblocks.push({
			ownerMarkdownPartId: firstPart.ownerMarkdownPartId,
			codeBlockIndex: firstPart.codeBlockIndex,
			elementId: this.context.element.id,
			uri: textModel.uri,
			uriPromise: Promise.resolve(textModel.uri),
			codemapperUri: undefined,
			chatSessionResource: this.context.element.sessionResource,
			focus: () => { }
		});
	}

	layout(width: number): void {
		this._editorReferences.forEach(r => r.object.layout(width));
	}
}
