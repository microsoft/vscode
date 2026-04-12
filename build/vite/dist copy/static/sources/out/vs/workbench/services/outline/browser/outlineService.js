/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IOutlineService } from './outline.js';
import { Emitter } from '../../../../base/common/event.js';
class OutlineService {
    constructor() {
        this._factories = new LinkedList();
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
    }
    canCreateOutline(pane) {
        for (const factory of this._factories) {
            if (factory.matches(pane)) {
                return true;
            }
        }
        return false;
    }
    async createOutline(pane, target, token) {
        for (const factory of this._factories) {
            if (factory.matches(pane)) {
                return await factory.createOutline(pane, target, token);
            }
        }
        return undefined;
    }
    registerOutlineCreator(creator) {
        const rm = this._factories.push(creator);
        this._onDidChange.fire();
        return toDisposable(() => {
            rm();
            this._onDidChange.fire();
        });
    }
}
registerSingleton(IOutlineService, OutlineService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRS9HLE9BQU8sRUFBNkIsZUFBZSxFQUFpQixNQUFNLGNBQWMsQ0FBQztBQUN6RixPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsTUFBTSxjQUFjO0lBQXBCO1FBSWtCLGVBQVUsR0FBRyxJQUFJLFVBQVUsRUFBNkIsQ0FBQztRQUV6RCxpQkFBWSxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDM0MsZ0JBQVcsR0FBZ0IsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUE0QjdELENBQUM7SUExQkEsZ0JBQWdCLENBQUMsSUFBaUI7UUFDakMsS0FBSyxNQUFNLE9BQU8sSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDdkMsSUFBSSxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxLQUFLLENBQUMsYUFBYSxDQUFDLElBQWlCLEVBQUUsTUFBcUIsRUFBRSxLQUF3QjtRQUNyRixLQUFLLE1BQU0sT0FBTyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN2QyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDM0IsT0FBTyxNQUFNLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN6RCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxPQUFrQztRQUN4RCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3pCLE9BQU8sWUFBWSxDQUFDLEdBQUcsRUFBRTtZQUN4QixFQUFFLEVBQUUsQ0FBQztZQUNMLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDMUIsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFHRCxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsY0FBYyxvQ0FBNEIsQ0FBQyJ9