/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { IActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IListStyles } from '../../../../../../base/browser/ui/list/listWidget.js';
import { IStyleOverride } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { AgentSessionRefreshReason, IAgentSession } from '../../agentSessions/agentSessionsModel.js';

/** The sessions list that the Chat view shows in its sessions section: its own, or one that a provider gives it. */
export interface IChatViewSessionsListControl extends IDisposable {
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	focus(): void;
	scrollToTop(): void;
	refresh(reason?: AgentSessionRefreshReason): void;
	/** Updates what it lists, such as as the Chat view's orientation changes its grouping; resolves to whether it did. */
	update(): Promise<boolean>;
	reveal(sessionResource: URI): boolean;
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	/** The sessions of the Chat view's own list that have focus, which actions of that list act on. */
	getFocus(): IAgentSession[];
	/** Opens the list's find, as Find of the Chat view's sessions toolbar does, which a list without a header of its own keeps. */
	openFind(): void;
	/** The widget of an action that the list contributes to the Chat view's title, where the list needs one of its own. */
	createActionViewItem?(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined;
}

/** A sessions list of the Chat view, with how the Chat view shows it. */
export interface IChatViewSessionsList {
	readonly control: IChatViewSessionsListControl;
	/** Whether it has its own header, with its title and its actions: the Chat view then shows none above it. */
	readonly hasHeader: boolean;
}

/** Gives the Chat view a sessions list in place of its own. */
export interface IChatViewSessionsListProvider {
	/** Creates the sessions list in `container`, with `instantiationService` of the Chat view. */
	create(container: HTMLElement, instantiationService: IInstantiationService, options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList;
}
