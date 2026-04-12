/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { asArray } from '../../../../base/common/arrays.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
/**
 * A context that is passed to actions as arguments to represent the terminal instance(s) being
 * acted upon.
 */
export class InstanceContext {
    constructor(instance) {
        // Only store the instance to avoid contexts holding on to disposed instances.
        this.instanceId = instance.instanceId;
    }
    toJSON() {
        return {
            $mid: 15 /* MarshalledId.TerminalContext */,
            instanceId: this.instanceId
        };
    }
}
export class TerminalContextActionRunner extends ActionRunner {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    async runAction(action, context) {
        if (Array.isArray(context) && context.every(e => e instanceof InstanceContext)) {
            // arg1: The (first) focused instance
            // arg2: All selected instances
            await action.run(context?.[0], context);
            return;
        }
        return super.runAction(action, context);
    }
}
export function openContextMenu(targetWindow, event, contextInstances, menu, contextMenuService, extraActions) {
    const standardEvent = new StandardMouseEvent(targetWindow, event);
    const actions = getFlatContextMenuActions(menu.getActions({ shouldForwardArgs: true }));
    if (extraActions) {
        actions.push(...extraActions);
    }
    const context = contextInstances ? asArray(contextInstances).map(e => new InstanceContext(e)) : [];
    const actionRunner = new TerminalContextActionRunner();
    contextMenuService.showContextMenu({
        actionRunner,
        getAnchor: () => standardEvent,
        getActions: () => actions,
        getActionsContext: () => context,
        onHide: () => actionRunner.dispose()
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb250ZXh0TWVudS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxDb250ZXh0TWVudS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsWUFBWSxFQUFXLE1BQU0sb0NBQW9DLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRzVELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBTTVHOzs7R0FHRztBQUNILE1BQU0sT0FBTyxlQUFlO0lBRzNCLFlBQVksUUFBMkI7UUFDdEMsOEVBQThFO1FBQzlFLElBQUksQ0FBQyxVQUFVLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQUN2QyxDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU87WUFDTixJQUFJLHVDQUE4QjtZQUNsQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVU7U0FDM0IsQ0FBQztJQUNILENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTywyQkFBNEIsU0FBUSxZQUFZO0lBRTVELGdFQUFnRTtJQUM3QyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQWUsRUFBRSxPQUF1QztRQUMxRixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxlQUFlLENBQUMsRUFBRSxDQUFDO1lBQ2hGLHFDQUFxQztZQUNyQywrQkFBK0I7WUFDL0IsTUFBTSxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3hDLE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN6QyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsZUFBZSxDQUFDLFlBQW9CLEVBQUUsS0FBaUIsRUFBRSxnQkFBNkQsRUFBRSxJQUFXLEVBQUUsa0JBQXVDLEVBQUUsWUFBd0I7SUFDck4sTUFBTSxhQUFhLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFbEUsTUFBTSxPQUFPLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUV4RixJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsTUFBTSxPQUFPLEdBQXNCLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFdEgsTUFBTSxZQUFZLEdBQUcsSUFBSSwyQkFBMkIsRUFBRSxDQUFDO0lBQ3ZELGtCQUFrQixDQUFDLGVBQWUsQ0FBQztRQUNsQyxZQUFZO1FBQ1osU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLGFBQWE7UUFDOUIsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU87UUFDekIsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTztRQUNoQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRTtLQUNwQyxDQUFDLENBQUM7QUFDSixDQUFDIn0=