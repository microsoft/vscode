/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TableColumnResizeQuickPick } from './tableColumnResizeQuickPick.js';
import { Table } from '../../../../base/browser/ui/table/tableWidget.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService, WorkbenchListFocusContextKey } from '../../../../platform/list/browser/listService.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
export class ListResizeColumnAction extends Action2 {
    constructor() {
        super({
            id: 'list.resizeColumn',
            title: { value: localize('list.resizeColumn', "Resize Column"), original: 'Resize Column' },
            category: { value: localize('list', "List"), original: 'List' },
            precondition: WorkbenchListFocusContextKey,
            f1: true
        });
    }
    async run(accessor) {
        const listService = accessor.get(IListService);
        const instantiationService = accessor.get(IInstantiationService);
        const list = listService.lastFocusedList;
        if (list instanceof Table) {
            await instantiationService.createInstance(TableColumnResizeQuickPick, list).show();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdFJlc2l6ZUNvbHVtbkFjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2xpc3QvYnJvd3Nlci9saXN0UmVzaXplQ29sdW1uQWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN6RSxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLFlBQVksRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsTUFBTSxPQUFPLHNCQUF1QixTQUFRLE9BQU87SUFDbEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsbUJBQW1CO1lBQ3ZCLEtBQUssRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsZUFBZSxDQUFDLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRTtZQUMzRixRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFO1lBQy9ELFlBQVksRUFBRSw0QkFBNEI7WUFDMUMsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQy9DLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sSUFBSSxHQUFHLFdBQVcsQ0FBQyxlQUFlLENBQUM7UUFDekMsSUFBSSxJQUFJLFlBQVksS0FBSyxFQUFFLENBQUM7WUFDM0IsTUFBTSxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDcEYsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9