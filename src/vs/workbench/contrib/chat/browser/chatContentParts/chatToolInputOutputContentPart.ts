/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../chat.js';
import { getAttachableImageExtension } from '../chatAttachmentResolve.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ChatAttachmentsContentPart } from './chatAttachmentsContentPart.js';
import { IDisposableReference } from './chatCollections.js';
import { ChatQueryTitlePart } from './chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from './chatContentParts.js';
import { EditorPool } from './chatMarkdownContentPart.js';

export interface IChatCollapsibleIOCodePart {
	kind: 'code';
	textModel: ITextModel;
	languageId: string;
	options: ICodeBlockRenderOptions;
	codeBlockInfo: IChatCodeBlockInfo;
}

export interface IChatCollapsibleIODataPart {
	kind: 'data';
	value: Uint8Array;
	mimeType: string;
}

export interface IChatCollapsibleInputData extends IChatCollapsibleIOCodePart { }
export interface IChatCollapsibleOutputData {
	// todo: show images etc. here
	parts: (IChatCollapsibleIOCodePart | IChatCollapsibleIODataPart)[];
}

export class ChatCollapsibleInputOutputContentPart extends Disposable {
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _currentWidth: number = 0;
	private readonly _editorReferences: IDisposableReference<CodeBlockPart>[] = [];
	private readonly _titlePart: ChatQueryTitlePart;
	public readonly domNode: HTMLElement;

	readonly codeblocks: IChatCodeBlockInfo[] = [];

	public set title(s: string | IMarkdownString) {
		this._titlePart.title = s;
	}

	public get title(): string | IMarkdownString {
		return this._titlePart.title;
	}

	private readonly _expanded: ISettableObservable<boolean>;

	public get expanded(): boolean {
		return this._expanded.get();
	}

	constructor(
		title: IMarkdownString | string,
		subtitle: string | IMarkdownString | undefined,
		private readonly context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		private readonly input: IChatCollapsibleInputData,
		private readonly output: IChatCollapsibleOutputData | undefined,
		isError: boolean,
		initiallyExpanded: boolean,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		const titleEl = dom.h('.chat-confirmation-widget-title-inner');
		const iconEl = dom.h('.chat-confirmation-widget-title-icon');
		const elements = dom.h('.chat-confirmation-widget');
		this.domNode = elements.root;

		const titlePart = this._titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			titleEl.root,
			title,
			subtitle,
			_instantiationService.createInstance(MarkdownRenderer, {}),
		));
		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		const spacer = document.createElement('span');
		spacer.style.flexGrow = '1';

		const btn = this._register(new ButtonWithIcon(elements.root, {}));
		btn.element.classList.add('chat-confirmation-widget-title', 'monaco-text-button');
		btn.labelElement.append(titleEl.root, iconEl.root);

		const check = dom.h(isError
			? ThemeIcon.asCSSSelector(Codicon.error)
			: output
				? ThemeIcon.asCSSSelector(Codicon.check)
				: ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, 'spin'))
		);
		iconEl.root.appendChild(check.root);

		const expanded = this._expanded = observableValue(this, initiallyExpanded);
		this._register(autorun(r => {
			const value = expanded.read(r);
			btn.icon = value ? Codicon.chevronDown : Codicon.chevronRight;
			elements.root.classList.toggle('collapsed', !value);
			this._onDidChangeHeight.fire();
		}));

		const toggle = (e: Event) => {
			if (!e.defaultPrevented) {
				const value = expanded.get();
				expanded.set(!value, undefined);
				e.preventDefault();
			}
		};

		this._register(btn.onDidClick(toggle));

		const message = dom.h('.chat-confirmation-widget-message');
		message.root.appendChild(this.createMessageContents());
		elements.root.appendChild(message.root);
	}

	private createMessageContents() {
		const contents = dom.h('div', [
			dom.h('h3@inputTitle'),
			dom.h('div@input'),
			dom.h('h3@outputTitle'),
			dom.h('div@output'),
		]);

		const { input, output } = this;

		contents.inputTitle.textContent = localize('chat.input', "Input");
		this.addCodeBlock(input, contents.input);

		if (!output) {
			contents.output.remove();
			contents.outputTitle.remove();
		} else {
			contents.outputTitle.textContent = localize('chat.output', "Output");
			for (const part of output.parts) {
				if (part.kind === 'data' && getAttachableImageExtension(part.mimeType)) {
					const n = this._register(this._instantiationService.createInstance(
						ChatAttachmentsContentPart,
						[{ kind: 'image', id: generateUuid(), name: `image.${getAttachableImageExtension(part.mimeType)}`, value: part.value, mimeType: part.mimeType, isURL: false }],
						undefined,
						undefined,
					));
					contents.output.appendChild(n.domNode!);
				} else if (part.kind === 'code') {
					this.addCodeBlock(part, contents.output);
				}
			}
		}

		return contents.root;
	}

	private addCodeBlock(part: IChatCollapsibleIOCodePart, container: HTMLElement) {
		const data: ICodeBlockData = {
			languageId: part.languageId,
			textModel: Promise.resolve(part.textModel),
			codeBlockIndex: part.codeBlockInfo.codeBlockIndex,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: part.options,
			chatSessionId: this.context.element.sessionId,
		};
		const editorReference = this._register(this.editorPool.get());
		editorReference.object.render(data, this._currentWidth || 300);
		this._register(editorReference.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));
		container.appendChild(editorReference.object.element);
		this._editorReferences.push(editorReference);
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// For now, we consider content different unless it's exactly the same instance
		return false;
	}

	layout(width: number): void {
		this._currentWidth = width;
		this._editorReferences.forEach(r => r.object.layout(width));
	}
}
