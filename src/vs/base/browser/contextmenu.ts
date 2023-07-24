/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { IActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { AnchorAlignment, AnchorAxisAlignment, IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { OmitOptional } from 'vs/base/common/types';

export interface IContextMenuEvent {
	readonly shiftKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly altKey?: boolean;
	readonly metaKey?: boolean;
}

export interface IContextMenuDelegate {
	getAnchor(): HTMLElement | IMouseEvent | OmitOptional<IAnchor>;
	getActions(): readonly IAction[];
	getCheckedActionsRepresentation?(action: IAction): 'radio' | 'checkbox';
	getActionViewItem?(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined;
	getActionsContext?(event?: IContextMenuEvent): unknown;
	getKeyBinding?(action: IAction): ResolvedKeybinding | undefined;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
	actionRunner?: IActionRunner;
	skipTelemetry?: boolean;
	autoSelectFirstItem?: boolean;
	anchorAlignment?: AnchorAlignment;
	anchorAxisAlignment?: AnchorAxisAlignment;
	domForShadowRoot?: HTMLElement;
}

export interface IContextMenuProvider {
	showContextMenu(delegate: IContextMenuDelegate): void;
}
