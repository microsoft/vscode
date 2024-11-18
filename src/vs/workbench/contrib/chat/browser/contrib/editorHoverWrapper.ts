/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorHoverWrapper.css';
import * as dom from '../../../../../base/browser/dom.js';
import { IHoverAction } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverAction } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

const $ = dom.$;
const h = dom.h;

/**
 * This borrows some of HoverWidget so that a chat editor hover can be rendered in the same way as a workbench hover.
 * Maybe it can be reusable in a generic way.
 */
export class ChatEditorHoverWrapper {
	public readonly domNode: HTMLElement;

	constructor(
		hoverContentElement: HTMLElement,
		actions: IHoverAction[] | undefined,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		const hoverElement = h(
			'.chat-editor-hover-wrapper@root',
			[h('.chat-editor-hover-wrapper-content@content')]);
		this.domNode = hoverElement.root;
		hoverElement.content.appendChild(hoverContentElement);

		if (actions && actions.length > 0) {
			const statusBarElement = $('.hover-row.status-bar');
			const actionsElement = $('.actions');
			actions.forEach(action => {
				const keybinding = this.keybindingService.lookupKeybinding(action.commandId);
				const keybindingLabel = keybinding ? keybinding.getLabel() : null;
				HoverAction.render(actionsElement, {
					label: action.label,
					commandId: action.commandId,
					run: e => {
						action.run(e);
					},
					iconClass: action.iconClass
				}, keybindingLabel);
			});
			statusBarElement.appendChild(actionsElement);
			this.domNode.appendChild(statusBarElement);
		}
	}
}
