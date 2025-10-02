/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';


export abstract class ChatCollapsibleContentPart extends Disposable implements IChatContentPart {

	private _domNode?: HTMLElement;

	protected readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	protected readonly hasFollowingContent: boolean;
	protected _isExpanded = observableValue<boolean>(this, false);
	protected _collapseButton: ButtonWithIcon | undefined;

	constructor(
		private title: IMarkdownString | string,
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
		this._collapseButton = collapseButton;
		this._domNode = $('.chat-used-context', undefined, buttonElement);
		collapseButton.label = referencesLabel;

		this._register(collapseButton.onDidClick(() => {
			const value = this._isExpanded.get();
			this._isExpanded.set(!value, undefined);
		}));

		this._register(autorun(r => {
			const value = this._isExpanded.read(r);
			collapseButton.icon = value ? Codicon.chevronDown : Codicon.chevronRight;
			this._domNode?.classList.toggle('chat-used-context-collapsed', !value);
			this.updateAriaLabel(collapseButton.element, typeof referencesLabel === 'string' ? referencesLabel : referencesLabel.value, this.isExpanded());

			if (this._domNode?.isConnected) {
				queueMicrotask(() => {
					this._onDidChangeHeight.fire();
				});
			}
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

	get expanded(): IObservable<boolean> {
		return this._isExpanded;
	}

	protected isExpanded(): boolean {
		return this._isExpanded.get();
	}

	protected setExpanded(value: boolean): void {
		this._isExpanded.set(value, undefined);
	}

	protected setTitle(title: string): void {
		this.title = title;
		if (this._collapseButton) {
			this._collapseButton.label = title;
			this.updateAriaLabel(this._collapseButton.element, title, this.isExpanded());
		}
	}
}
