/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { HoverAction } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorHoverAction, IEditorHoverStatusBar } from './hoverTypes.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';

const $ = dom.$;

export class EditorHoverStatusBar extends Disposable implements IEditorHoverStatusBar {

	public readonly hoverElement: HTMLElement;
	public readonly actions: HoverAction[] = [];

	private readonly actionsElement: HTMLElement;
	private _hasContent: boolean = false;

	public get hasContent() {
		return this._hasContent;
	}

	constructor(
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
		this.hoverElement = $('div.hover-row.status-bar');
		this.hoverElement.tabIndex = 0;
		this.actionsElement = dom.append(this.hoverElement, $('div.actions'));
	}

	public addAction(
		actionOptions: {
			label: string;
			iconClass?: string; run: (target: HTMLElement) => void;
			commandId: string;
		}): IEditorHoverAction {

		const keybinding = this._keybindingService.lookupKeybinding(actionOptions.commandId);
		const keybindingLabel = keybinding ? keybinding.getLabel() : null;
		this._hasContent = true;
		const action = this._register(HoverAction.render(this.actionsElement, actionOptions, keybindingLabel));
		this._register(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), action.actionContainer, action.actionRenderedLabel));
		this.actions.push(action);
		return action;
	}

	public append(element: HTMLElement): HTMLElement {
		const result = dom.append(this.actionsElement, element);
		this._hasContent = true;
		return result;
	}
}
