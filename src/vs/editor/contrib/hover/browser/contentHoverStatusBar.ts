/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from 'vs/base/browser/dom';
import { HoverAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorHoverAction, IEditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

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
		this.actions.push(action);
		return action;
	}

	public append(element: HTMLElement): HTMLElement {
		const result = dom.append(this.actionsElement, element);
		this._hasContent = true;
		return result;
	}
}
