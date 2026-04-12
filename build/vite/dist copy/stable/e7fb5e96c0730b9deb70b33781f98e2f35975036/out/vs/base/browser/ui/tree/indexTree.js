/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AbstractTree } from './abstractTree.js';
import { IndexTreeModel } from './indexTreeModel.js';
import { TreeError } from './tree.js';
import { Iterable } from '../../../common/iterator.js';
import './media/tree.css';
export class IndexTree extends AbstractTree {
    constructor(user, container, delegate, renderers, rootElement, options = {}) {
        super(user, container, delegate, renderers, options);
        this.user = user;
        this.rootElement = rootElement;
    }
    splice(location, deleteCount, toInsert = Iterable.empty()) {
        this.model.splice(location, deleteCount, toInsert);
    }
    rerender(location) {
        if (location === undefined) {
            this.view.rerender();
            return;
        }
        this.model.rerender(location);
    }
    updateElementHeight(location, height) {
        if (location.length === 0) {
            throw new TreeError(this.user, `Update element height failed: invalid location`);
        }
        const elementIndex = this.model.getListIndex(location);
        if (elementIndex === -1) {
            return;
        }
        this.view.updateElementHeight(elementIndex, height);
    }
    createModel(user, options) {
        return new IndexTreeModel(user, this.rootElement, options);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhUcmVlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3VpL3RyZWUvaW5kZXhUcmVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxZQUFZLEVBQXdCLE1BQU0sbUJBQW1CLENBQUM7QUFDdkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBMkMsU0FBUyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLGtCQUFrQixDQUFDO0FBSTFCLE1BQU0sT0FBTyxTQUFpQyxTQUFRLFlBQXNDO0lBSTNGLFlBQ2tCLElBQVksRUFDN0IsU0FBc0IsRUFDdEIsUUFBaUMsRUFDakMsU0FBbUQsRUFDM0MsV0FBYyxFQUN0QixVQUE2QyxFQUFFO1FBRS9DLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFQcEMsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUlyQixnQkFBVyxHQUFYLFdBQVcsQ0FBRztJQUl2QixDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQWtCLEVBQUUsV0FBbUIsRUFBRSxXQUFzQyxRQUFRLENBQUMsS0FBSyxFQUFFO1FBQ3JHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVELFFBQVEsQ0FBQyxRQUFtQjtRQUMzQixJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVELG1CQUFtQixDQUFDLFFBQWtCLEVBQUUsTUFBYztRQUNyRCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGdEQUFnRCxDQUFDLENBQUM7UUFDbEYsQ0FBQztRQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZELElBQUksWUFBWSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDekIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFlBQVksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRVMsV0FBVyxDQUFDLElBQVksRUFBRSxPQUEwQztRQUM3RSxPQUFPLElBQUksY0FBYyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzVELENBQUM7Q0FDRCJ9