/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { $ } from './chatReferencesContentPart.js';
import { EditorPool } from './chatMarkdownContentPart.js';
import { CodeBlockPart, ICodeBlockData, ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IDisposableReference } from './chatCollections.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';


export abstract class ChatCollapsibleContentPart extends Disposable implements IChatContentPart {

	private _domNode?: HTMLElement;

	protected readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	protected readonly hasFollowingContent: boolean;

	constructor(
		private readonly title: IMarkdownString | string,
		protected readonly context: IChatContentPartRenderContext,
	) {
		super();
		this.hasFollowingContent = this.context.contentIndex + 1 < this.context.content.length;
	}

	get domNode(): HTMLElement {
		this._domNode ??= this.init();
		return this._domNode;
	}

	protected init(): HTMLElement {
		const referencesLabel = this.title;

		const icon = () => {
			return this.isExpanded() ? Codicon.chevronDown : Codicon.chevronRight;
		};
		const buttonElement = $('.chat-used-context-label', undefined);

		const collapseButton = this._register(new ButtonWithIcon(buttonElement, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		this._domNode = $('.chat-used-context', undefined, buttonElement);
		collapseButton.label = referencesLabel;
		collapseButton.icon = icon();
		this.updateAriaLabel(collapseButton.element, typeof referencesLabel === 'string' ? referencesLabel : referencesLabel.value, this.isExpanded());
		this._domNode.classList.toggle('chat-used-context-collapsed', !this.isExpanded());
		this._register(collapseButton.onDidClick(() => {
			this.setExpanded(!this.isExpanded());
			collapseButton.icon = icon();
			this._domNode?.classList.toggle('chat-used-context-collapsed', !this.isExpanded());
			this._onDidChangeHeight.fire();
			this.updateAriaLabel(collapseButton.element, typeof referencesLabel === 'string' ? referencesLabel : referencesLabel.value, this.isExpanded());
		}));


		const content = this.initContent();
		this._domNode.appendChild(content);
		return this._domNode;
	}

	protected abstract initContent(): HTMLElement;

	abstract hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean;

	private updateAriaLabel(element: HTMLElement, label: string, expanded?: boolean): void {
		element.ariaLabel = expanded ? localize('usedReferencesExpanded', "{0}, expanded", label) : localize('usedReferencesCollapsed', "{0}, collapsed", label);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	private _isExpanded = false;
	protected isExpanded(): boolean {
		return this._isExpanded;
	}

	protected setExpanded(value: boolean): void {
		this._isExpanded = value;
	}
}


export class ChatCollapsibleEditorContentPart extends ChatCollapsibleContentPart {

	private readonly _editorReference: IDisposableReference<CodeBlockPart>;
	private readonly _contentDomNode: HTMLElement;

	private _currentWidth: number = 0;

	constructor(
		title: IMarkdownString | string,
		context: IChatContentPartRenderContext,
		private readonly editorPool: EditorPool,
		private readonly textModel: Promise<ITextModel>,
		private readonly languageId: string,
		private readonly options: ICodeBlockRenderOptions = {},
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(title, context);
		this._contentDomNode = $('div.chat-collapsible-editor-content');
		this._editorReference = this.editorPool.get();
	}

	override dispose(): void {
		this._editorReference?.dispose();
		super.dispose();
	}

	protected initContent(): HTMLElement {
		const data: ICodeBlockData = {
			languageId: this.languageId,
			textModel: this.textModel,
			codeBlockIndex: 0,
			codeBlockPartIndex: 0,
			element: this.context.element,
			parentContextKeyService: this.contextKeyService,
			renderOptions: this.options
		};

		this._editorReference.object.render(data, this._currentWidth || 300);
		this._register(this._editorReference.object.onDidChangeContentHeight(() => this._onDidChangeHeight.fire()));
		this._contentDomNode.appendChild(this._editorReference.object.element);

		this.setExpanded(false);
		return this._contentDomNode;
	}

	protected override setExpanded(value: boolean): void {
		super.setExpanded(value);
		if (value) {
			this._contentDomNode.style.display = 'block';
			// this._editorReference.object.layout(this._currentWidth);
		} else if (!value) {
			// Hide content when collapsing
			this._contentDomNode.style.display = 'none';
		}
		this._onDidChangeHeight.fire();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// For now, we consider content different unless it's exactly the same instance
		return false;
	}

	layout(width: number): void {
		this._currentWidth = width;
		this._editorReference.object.layout(width);
	}
}
