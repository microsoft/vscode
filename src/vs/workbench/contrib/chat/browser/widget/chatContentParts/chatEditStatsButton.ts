/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, EventHelper } from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { getComparisonKey } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IChatContentPartDiffData, IChatContentPartDiffResource } from './chatContentParts.js';
import './media/chatEditStatsButton.css';

export function aggregateChatEditDiffs(diffs: Iterable<IChatContentPartDiffData>): IChatContentPartDiffData {
	let added = 0;
	let removed = 0;
	const resources = new Map<string, IChatContentPartDiffResource>();
	for (const diff of diffs) {
		added += diff.added;
		removed += diff.removed;
		for (const resource of diff.resources) {
			const key = getComparisonKey(resource.resource);
			const first = resources.get(key);
			resources.set(key, first ? { ...resource, originalURI: first.originalURI } : resource);
		}
	}
	return {
		added, removed,
		resources: [...resources.values()].filter(resource => resource.originalURI !== undefined || resource.modifiedURI !== undefined),
	};
}

export class ChatEditStatsButton extends Button {
	private diff: IChatContentPartDiffData = { added: 0, removed: 0, resources: [] };

	constructor(
		container: HTMLElement,
		title: string,
		className: string,
		@IEditorService editorService: IEditorService,
		@IHoverService hoverService: IHoverService,
	) {
		super(container, {});
		this.element.classList.add(className);
		this._register(this.onDidClick(event => {
			EventHelper.stop(event, true);
			editorService.openEditor({
				multiDiffSource: URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`),
				label: title,
				resources: this.diff.resources.map(resource => ({
					original: { resource: resource.originalURI },
					modified: { resource: resource.modifiedURI },
					goToFileResource: resource.resource,
				})),
			});
		}));
		this._register(hoverService.setupDelayedHover(this.element, {
			content: localize('chat.edits.viewChanges', "View File Changes"),
			style: HoverStyle.Pointer,
		}));
	}

	setDiff(diff: IChatContentPartDiffData): void {
		this.diff = diff;
		this.element.replaceChildren(
			$('span.label-added', {}, `+${diff.added}`),
			$('span.label-removed', {}, `-${diff.removed}`),
		);
		this.setAriaLabel(localize('chat.edits.viewChangesAccessible', "View file changes, {0} lines added, {1} lines deleted", diff.added, diff.removed));
	}
}
