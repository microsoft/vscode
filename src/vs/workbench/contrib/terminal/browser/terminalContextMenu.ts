/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { asArray } from '../../../../base/common/arrays.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { SingleOrMany } from '../../../../base/common/types.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu } from '../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ITerminalInstance } from './terminal.js';
import { ISerializedTerminalInstanceContext } from '../common/terminal.js';

/**
 * A context that is passed to actions as arguments to represent the terminal instance(s) being
 * acted upon.
 */
export class InstanceContext {
	readonly instanceId: number;

	constructor(instance: ITerminalInstance) {
		// Only store the instance to avoid contexts holding on to disposed instances.
		this.instanceId = instance.instanceId;
	}

	toJSON(): ISerializedTerminalInstanceContext {
		return {
			$mid: MarshalledId.TerminalContext,
			instanceId: this.instanceId
		};
	}
}

export class TerminalContextActionRunner extends ActionRunner {

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected override async runAction(action: IAction, context?: InstanceContext | InstanceContext[]): Promise<void> {
		if (Array.isArray(context) && context.every(e => e instanceof InstanceContext)) {
			// arg1: The (first) focused instance
			// arg2: All selected instances
			await action.run(context?.[0], context);
			return;
		}
		return super.runAction(action, context);
	}
}

export function openContextMenu(targetWindow: Window, event: MouseEvent, contextInstances: SingleOrMany<ITerminalInstance> | undefined, menu: IMenu, contextMenuService: IContextMenuService, extraActions?: IAction[]): void {
	const standardEvent = new StandardMouseEvent(targetWindow, event);

	const actions: IAction[] = [];

	createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, actions);

	if (extraActions) {
		actions.push(...extraActions);
	}

	const context: InstanceContext[] = contextInstances ? asArray(contextInstances).map(e => new InstanceContext(e)) : [];

	contextMenuService.showContextMenu({
		actionRunner: new TerminalContextActionRunner(),
		getAnchor: () => standardEvent,
		getActions: () => actions,
		getActionsContext: () => context,
	});
}
