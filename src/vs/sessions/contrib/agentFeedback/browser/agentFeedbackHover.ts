/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

/**
 * Creates the custom hover content for the "N comments" attachment.
 * Shows each feedback item with its file, range, text, and actions (remove / go to).
 */
export class AgentFeedbackHover extends Disposable {

	constructor(
		private readonly _element: HTMLElement,
		private readonly _attachment: IAgentFeedbackVariableEntry,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
	) {
		super();

		// Show on hover (delayed)
		this._store.add(this._hoverService.setupDelayedHover(
			this._element,
			() => this._buildHoverContent(),
			{ groupId: 'chat-attachments' }
		));

		// Show immediately on click
		this._store.add(dom.addDisposableListener(this._element, dom.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._showHoverNow();
		}));
	}

	private _showHoverNow(): void {
		const opts = this._buildHoverContent();
		this._hoverService.showInstantHover({
			content: opts.content,
			target: this._element,
			style: opts.style,
			position: opts.position,
			trapFocus: opts.trapFocus,
		});
	}

	private _buildHoverContent(): { content: HTMLElement; style: HoverStyle; position: { hoverPosition: HoverPosition }; trapFocus: boolean; dispose: () => void } {
		const disposables = new DisposableStore();
		const hoverElement = dom.$('div.agent-feedback-hover');

		const title = dom.$('div.agent-feedback-hover-title');
		title.textContent = this._attachment.feedbackItems.length === 1
			? localize('agentFeedbackHover.titleOne', "1 feedback comment")
			: localize('agentFeedbackHover.titleMany', "{0} feedback comments", this._attachment.feedbackItems.length);
		hoverElement.appendChild(title);

		const list = dom.$('div.agent-feedback-hover-list');
		hoverElement.appendChild(list);

		// Create ResourceLabels for file icons
		const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		// Group feedback items by file
		const byFile = new Map<string, typeof this._attachment.feedbackItems[number][]>();
		for (const item of this._attachment.feedbackItems) {
			const key = item.resourceUri.toString();
			let group = byFile.get(key);
			if (!group) {
				group = [];
				byFile.set(key, group);
			}
			group.push(item);
		}

		for (const [, items] of byFile) {
			// File header with icon via ResourceLabels
			const fileHeader = dom.$('div.agent-feedback-hover-file-header');
			list.appendChild(fileHeader);
			const label = resourceLabels.create(fileHeader);
			label.setFile(items[0].resourceUri, { hidePath: false });

			for (const item of items) {
				const row = dom.$('div.agent-feedback-hover-row');
				list.appendChild(row);

				// Feedback text - clicking goes to location
				const text = dom.$('div.agent-feedback-hover-text');
				text.textContent = item.text;
				row.appendChild(text);

				row.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this._goToFeedback(item.resourceUri, item.range);
				});

				// Remove button
				const removeBtn = dom.$('a.agent-feedback-hover-remove');
				removeBtn.title = localize('agentFeedbackHover.remove', "Remove feedback");
				const removeIcon = dom.$('span');
				removeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
				removeBtn.appendChild(removeIcon);
				row.appendChild(removeBtn);

				removeBtn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					this._agentFeedbackService.removeFeedback(this._attachment.sessionResource, item.id);
				});
			}
		}

		return {
			content: hoverElement,
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.BELOW },
			trapFocus: true,
			dispose: () => disposables.dispose(),
		};
	}

	private _goToFeedback(resourceUri: URI, range: IRange): void {
		this._editorService.openEditor({
			resource: resourceUri,
			options: {
				selection: range,
				preserveFocus: false,
				revealIfVisible: true,
			}
		});
	}
}
