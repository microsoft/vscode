/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IInteractiveHistoryService = createDecorator('IInteractiveHistoryService');
export class InteractiveHistoryService extends Disposable {
    constructor() {
        super();
        this._history = new ResourceMap();
    }
    matchesCurrent(uri, value) {
        const history = this._history.get(uri);
        if (!history) {
            return false;
        }
        return history.current() === value;
    }
    addToHistory(uri, value) {
        const history = this._history.get(uri);
        if (!history) {
            this._history.set(uri, new HistoryNavigator2([value], 50));
            return;
        }
        history.resetCursor();
        history.add(value);
    }
    getPreviousValue(uri) {
        const history = this._history.get(uri);
        return history?.previous() ?? null;
    }
    getNextValue(uri) {
        const history = this._history.get(uri);
        return history?.next() ?? null;
    }
    replaceLast(uri, value) {
        const history = this._history.get(uri);
        if (!history) {
            this._history.set(uri, new HistoryNavigator2([value], 50));
            return;
        }
        else {
            history.replaceLast(value);
            history.resetCursor();
        }
    }
    clearHistory(uri) {
        this._history.delete(uri);
    }
    has(uri) {
        return this._history.has(uri) ? true : false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2ludGVyYWN0aXZlL2Jyb3dzZXIvaW50ZXJhY3RpdmVIaXN0b3J5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTdELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxlQUFlLENBQTZCLDRCQUE0QixDQUFDLENBQUM7QUFjcEgsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFVBQVU7SUFJeEQ7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxXQUFXLEVBQTZCLENBQUM7SUFDOUQsQ0FBQztJQUVELGNBQWMsQ0FBQyxHQUFRLEVBQUUsS0FBYTtRQUNyQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsS0FBSyxLQUFLLENBQUM7SUFDcEMsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFRLEVBQUUsS0FBYTtRQUNuQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsSUFBSSxpQkFBaUIsQ0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbkUsT0FBTztRQUNSLENBQUM7UUFFRCxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDdEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNwQixDQUFDO0lBRUQsZ0JBQWdCLENBQUMsR0FBUTtRQUN4QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN2QyxPQUFPLE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUM7SUFDcEMsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFRO1FBQ3BCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXZDLE9BQU8sT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLElBQUksQ0FBQztJQUNoQyxDQUFDO0lBRUQsV0FBVyxDQUFDLEdBQVEsRUFBRSxLQUFhO1FBQ2xDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLGlCQUFpQixDQUFTLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuRSxPQUFPO1FBQ1IsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzNCLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN2QixDQUFDO0lBQ0YsQ0FBQztJQUVELFlBQVksQ0FBQyxHQUFRO1FBQ3BCLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxHQUFHLENBQUMsR0FBUTtRQUNYLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO0lBQzlDLENBQUM7Q0FFRCJ9