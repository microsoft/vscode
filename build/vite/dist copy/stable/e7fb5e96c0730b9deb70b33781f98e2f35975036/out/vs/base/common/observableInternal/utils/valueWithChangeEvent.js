/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../commonFacade/deps.js';
import { observableFromEvent } from '../observables/observableFromEvent.js';
export class ValueWithChangeEventFromObservable {
    constructor(observable) {
        this.observable = observable;
    }
    get onDidChange() {
        return Event.fromObservableLight(this.observable);
    }
    get value() {
        return this.observable.get();
    }
}
export function observableFromValueWithChangeEvent(owner, value) {
    if (value instanceof ValueWithChangeEventFromObservable) {
        return value.observable;
    }
    return observableFromEvent(owner, value.onDidChange, () => value.value);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsdWVXaXRoQ2hhbmdlRXZlbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvdXRpbHMvdmFsdWVXaXRoQ2hhbmdlRXZlbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBeUIsTUFBTSx5QkFBeUIsQ0FBQztBQUV2RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUU1RSxNQUFNLE9BQU8sa0NBQWtDO0lBQzlDLFlBQTRCLFVBQTBCO1FBQTFCLGVBQVUsR0FBVixVQUFVLENBQWdCO0lBQ3RELENBQUM7SUFFRCxJQUFJLFdBQVc7UUFDZCxPQUFPLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUM5QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLFVBQVUsa0NBQWtDLENBQUksS0FBaUIsRUFBRSxLQUErQjtJQUN2RyxJQUFJLEtBQUssWUFBWSxrQ0FBa0MsRUFBRSxDQUFDO1FBQ3pELE9BQU8sS0FBSyxDQUFDLFVBQVUsQ0FBQztJQUN6QixDQUFDO0lBQ0QsT0FBTyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDekUsQ0FBQyJ9