/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { SingleOrMany } from 'vs/base/common/types';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ISerializedTerminalInstanceContext } from 'vs/workbench/contrib/terminal/common/terminal';

class IInstanceContext {
	private _instanceIds: number[];

	constructor(
		instances: SingleOrMany<ITerminalInstance> | undefined
	) {
		this._instanceIds = (!instances ? [] : Array.isArray(instances) ? instances : [instances]).map(e => e.instanceId);
	}

	toJSON(): ISerializedTerminalInstanceContext {
		return {
			$mid: MarshalledId.TerminalContext,
			instanceIds: this._instanceIds
		};
	}
}

export function openContextMenu(event: MouseEvent, contextInstances: SingleOrMany<ITerminalInstance> | undefined, menu: IMenu, contextMenuService: IContextMenuService, extraActions?: IAction[]): void {
	const standardEvent = new StandardMouseEvent(event);

	const actions: IAction[] = [];

	createAndFillInContextMenuActions(menu, undefined, actions);

	if (extraActions) {
		actions.push(...extraActions);
	}

	contextMenuService.showContextMenu({
		getAnchor: () => standardEvent,
		getActions: () => actions,
		getActionsContext: () => new IInstanceContext(contextInstances),
	});
}
