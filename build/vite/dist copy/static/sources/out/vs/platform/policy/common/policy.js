/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IPolicyService = createDecorator('policy');
export class AbstractPolicyService extends Disposable {
    constructor() {
        super(...arguments);
        this.policyDefinitions = {};
        this.policies = new Map();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
    }
    async updatePolicyDefinitions(policyDefinitions) {
        const size = Object.keys(this.policyDefinitions).length;
        this.policyDefinitions = { ...policyDefinitions, ...this.policyDefinitions };
        if (size !== Object.keys(this.policyDefinitions).length) {
            await this._updatePolicyDefinitions(this.policyDefinitions);
        }
        return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
    }
    getPolicyValue(name) {
        return this.policies.get(name);
    }
    serialize() {
        return Iterable.reduce(Object.entries(this.policyDefinitions), (r, [name, definition]) => ({ ...r, [name]: { definition, value: this.policies.get(name) } }), {});
    }
}
export class NullPolicyService {
    constructor() {
        this.onDidChange = Event.None;
        this.policyDefinitions = {};
    }
    async updatePolicyDefinitions() { return {}; }
    getPolicyValue() { return undefined; }
    serialize() { return undefined; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWN5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQVE5RSxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFpQixRQUFRLENBQUMsQ0FBQztBQVl4RSxNQUFNLE9BQWdCLHFCQUFzQixTQUFRLFVBQVU7SUFBOUQ7O1FBR1Esc0JBQWlCLEdBQXdDLEVBQUUsQ0FBQztRQUN6RCxhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFFckMsaUJBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF5QixDQUFDLENBQUM7UUFDOUUsZ0JBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQXNCaEQsQ0FBQztJQXBCQSxLQUFLLENBQUMsdUJBQXVCLENBQUMsaUJBQXNEO1FBQ25GLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ3hELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLEdBQUcsaUJBQWlCLEVBQUUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUU3RSxJQUFJLElBQUksS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3pELE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RyxDQUFDO0lBRUQsY0FBYyxDQUFDLElBQWdCO1FBQzlCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVELFNBQVM7UUFDUixPQUFPLFFBQVEsQ0FBQyxNQUFNLENBQTBHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM3USxDQUFDO0NBR0Q7QUFFRCxNQUFNLE9BQU8saUJBQWlCO0lBQTlCO1FBRVUsZ0JBQVcsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBSWxDLHNCQUFpQixHQUF3QyxFQUFFLENBQUM7SUFDN0QsQ0FBQztJQUpBLEtBQUssQ0FBQyx1QkFBdUIsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDOUMsY0FBYyxLQUFLLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN0QyxTQUFTLEtBQUssT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0NBRWpDIn0=