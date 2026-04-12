/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { transaction } from '../transaction.js';
import { DebugNameData } from '../debugName.js';
import { BaseObservable } from './baseObservable.js';
import { DebugLocation } from '../debugLocation.js';
export function observableSignalFromEvent(owner, event, debugLocation = DebugLocation.ofCaller()) {
    return new FromEventObservableSignal(typeof owner === 'string' ? owner : new DebugNameData(owner, undefined, undefined), event, debugLocation);
}
class FromEventObservableSignal extends BaseObservable {
    constructor(debugNameDataOrName, event, debugLocation) {
        super(debugLocation);
        this.event = event;
        this.handleEvent = () => {
            transaction((tx) => {
                for (const o of this._observers) {
                    tx.updateObserver(o, this);
                    o.handleChange(this, undefined);
                }
            }, () => this.debugName);
        };
        this.debugName = typeof debugNameDataOrName === 'string'
            ? debugNameDataOrName
            : debugNameDataOrName.getDebugName(this) ?? 'Observable Signal From Event';
    }
    onFirstObserverAdded() {
        this.subscription = this.event(this.handleEvent);
    }
    onLastObserverRemoved() {
        this.subscription.dispose();
        this.subscription = undefined;
    }
    get() {
        // NO OP
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUVoRCxPQUFPLEVBQWMsYUFBYSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDNUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUVwRCxNQUFNLFVBQVUseUJBQXlCLENBQ3hDLEtBQTBCLEVBQzFCLEtBQWlCLEVBQ2pCLGFBQWEsR0FBRyxhQUFhLENBQUMsUUFBUSxFQUFFO0lBRXhDLE9BQU8sSUFBSSx5QkFBeUIsQ0FBQyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDaEosQ0FBQztBQUVELE1BQU0seUJBQTBCLFNBQVEsY0FBb0I7SUFJM0QsWUFDQyxtQkFBMkMsRUFDMUIsS0FBaUIsRUFDbEMsYUFBNEI7UUFFNUIsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBSEosVUFBSyxHQUFMLEtBQUssQ0FBWTtRQWFsQixnQkFBVyxHQUFHLEdBQUcsRUFBRTtZQUNuQyxXQUFXLENBQ1YsQ0FBQyxFQUFFLEVBQUUsRUFBRTtnQkFDTixLQUFLLE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDakMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzNCLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO1lBQ0YsQ0FBQyxFQUNELEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQ3BCLENBQUM7UUFDSCxDQUFDLENBQUM7UUFuQkQsSUFBSSxDQUFDLFNBQVMsR0FBRyxPQUFPLG1CQUFtQixLQUFLLFFBQVE7WUFDdkQsQ0FBQyxDQUFDLG1CQUFtQjtZQUNyQixDQUFDLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLDhCQUE4QixDQUFDO0lBQzdFLENBQUM7SUFFa0Isb0JBQW9CO1FBQ3RDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQWNrQixxQkFBcUI7UUFDdkMsSUFBSSxDQUFDLFlBQWEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUMsWUFBWSxHQUFHLFNBQVMsQ0FBQztJQUMvQixDQUFDO0lBRWUsR0FBRztRQUNsQixRQUFRO0lBQ1QsQ0FBQztDQUNEIn0=