/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode, hide, show } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatResourceGroupWidget } from './chatResourceGroupWidget.js';
import { IChatCollapsibleIODataPart } from './chatToolInputOutputContentPart.js';

export class ChatThinkingExternalResourceWidget extends Disposable {

	public readonly domNode: HTMLElement;
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly resourcePartsByToolCallId = new Map<string, IChatCollapsibleIODataPart[]>();
	private readonly resourceGroupWidget = this._register(new MutableDisposable<ChatResourceGroupWidget>());
	private readonly resourceGroupWidgetHeightListener = this._register(new MutableDisposable<IDisposable>());
	private isCollapsed = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.domNode = $('.chat-thinking-external-resources');
		hide(this.domNode);
	}

	public setToolInvocationParts(toolCallId: string, parts: IChatCollapsibleIODataPart[]): void {
		if (parts.length === 0) {
			return;
		}

		this.resourcePartsByToolCallId.set(toolCallId, parts);

		this.rebuild();
	}

	public removeToolInvocation(toolCallId: string): void {
		if (!this.resourcePartsByToolCallId.delete(toolCallId)) {
			return;
		}

		this.rebuild();
	}

	public setCollapsed(collapsed: boolean): void {
		this.isCollapsed = collapsed;

		if (!this.resourceGroupWidget.value) {
			hide(this.domNode);
			return;
		}

		if (this.isCollapsed) {
			show(this.domNode);
		} else {
			hide(this.domNode);
		}
	}

	private rebuild(): void {
		const allParts: IChatCollapsibleIODataPart[] = [];
		for (const parts of this.resourcePartsByToolCallId.values()) {
			allParts.push(...parts);
		}

		this.resourceGroupWidgetHeightListener.clear();
		this.resourceGroupWidget.clear();
		clearNode(this.domNode);

		if (allParts.length === 0) {
			hide(this.domNode);
			this._onDidChangeHeight.fire();
			return;
		}

		const widget = this.instantiationService.createInstance(ChatResourceGroupWidget, allParts);
		this.resourceGroupWidgetHeightListener.value = widget.onDidChangeHeight(() => this._onDidChangeHeight.fire());
		this.resourceGroupWidget.value = widget;
		this.domNode.appendChild(widget.domNode);
		this.setCollapsed(this.isCollapsed);
		this._onDidChangeHeight.fire();
	}
}
