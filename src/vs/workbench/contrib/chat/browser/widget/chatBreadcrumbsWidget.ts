/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';

export class ChatBreadcrumbsWidget extends Disposable {
	readonly domNode: HTMLElement;

	private readonly _chatModel = observableValue<IChatModel | undefined>(this, undefined);
	private readonly _modelDisposables = this._register(new DisposableStore());

	constructor() {
		super();
		this.domNode = dom.$('.chat-breadcrumbs-widget');
		this.domNode.style.padding = '4px 8px';
		this.domNode.style.display = 'flex';
		this.domNode.style.flexWrap = 'wrap';
		this.domNode.style.gap = '6px';
		this.domNode.style.borderBottom = '1px solid var(--vscode-chat-requestBorder)';

		this._register(autorun(reader => {
			const model = this._chatModel.read(reader);
			this._modelDisposables.clear();

			if (!model) {
				this.domNode.style.display = 'none';
				return;
			}

			const onDidChangeObs = observableFromEvent(this, model.onDidChange, () => model.pinnedSegments);
			
			this._modelDisposables.add(autorun(reader => {
				onDidChangeObs.read(reader);
				const currentSegments = model.pinnedSegments;
				
				dom.clearNode(this.domNode);
				
				if (!currentSegments || currentSegments.length === 0) {
					this.domNode.style.display = 'none';
					return;
				}
				
				this.domNode.style.display = 'flex';
				
				for (const segment of currentSegments) {
					const chip = dom.append(this.domNode, dom.$('.chat-breadcrumb-chip'));
					chip.style.display = 'inline-flex';
					chip.style.alignItems = 'center';
					chip.style.padding = '2px 6px';
					chip.style.borderRadius = '12px';
					chip.style.fontSize = '12px';
					chip.style.backgroundColor = 'var(--vscode-badge-background)';
					chip.style.color = 'var(--vscode-badge-foreground)';
					chip.style.cursor = 'pointer';
					
					const icon = dom.append(chip, dom.$('span'));
					icon.className = ThemeIcon.asClassName(Codicon.pin);
					icon.style.marginRight = '4px';
					icon.style.fontSize = '10px';
					
					const label = dom.append(chip, dom.$('span'));
					label.textContent = localize('pinnedContext', "Pinned Context");
					
					const removeBtn = dom.append(chip, dom.$('span'));
					removeBtn.className = ThemeIcon.asClassName(Codicon.close);
					removeBtn.style.marginLeft = '4px';
					removeBtn.style.fontSize = '10px';
					removeBtn.style.cursor = 'pointer';
					removeBtn.title = localize('unpin', "Unpin");
					
					this._modelDisposables.add(dom.addDisposableListener(removeBtn, dom.EventType.CLICK, (e) => {
						e.stopPropagation();
						if ('unpinSegment' in model) {
							(model as any).unpinSegment(segment.id);
						}
					}));
				}
			}));
		}));
	}

	setModel(model: IChatModel | undefined): void {
		this._chatModel.set(model, undefined);
	}
}
