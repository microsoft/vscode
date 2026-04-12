/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { cancelOnDispose } from '../commonFacade/cancellation.js';
import { DisposableStore } from '../commonFacade/deps.js';
import { autorunWithStoreHandleChanges } from '../reactions/autorun.js';
export function runOnChange(observable, cb) {
    let _previousValue;
    let _firstRun = true;
    return autorunWithStoreHandleChanges({
        changeTracker: {
            createChangeSummary: () => ({ deltas: [], didChange: false }),
            handleChange: (context, changeSummary) => {
                if (context.didChange(observable)) {
                    const e = context.change;
                    if (e !== undefined) {
                        changeSummary.deltas.push(e);
                    }
                    changeSummary.didChange = true;
                }
                return true;
            },
        }
    }, (reader, changeSummary) => {
        const value = observable.read(reader);
        const previousValue = _previousValue;
        if (changeSummary.didChange) {
            _previousValue = value;
            // didChange can never be true on the first autorun, so we know previousValue is defined
            cb(value, previousValue, changeSummary.deltas);
        }
        if (_firstRun) {
            _firstRun = false;
            _previousValue = value;
        }
    });
}
export function runOnChangeWithStore(observable, cb) {
    const store = new DisposableStore();
    const disposable = runOnChange(observable, (value, previousValue, deltas) => {
        store.clear();
        cb(value, previousValue, deltas, store);
    });
    return {
        dispose() {
            disposable.dispose();
            store.dispose();
        }
    };
}
export function runOnChangeWithCancellationToken(observable, cb) {
    return runOnChangeWithStore(observable, (value, previousValue, deltas, store) => {
        cb(value, previousValue, deltas, cancelOnDispose(store));
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuT25DaGFuZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvdXRpbHMvcnVuT25DaGFuZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFxQixlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0seUJBQXlCLENBQUM7QUFDdkUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFJeEUsTUFBTSxVQUFVLFdBQVcsQ0FBYSxVQUE2QyxFQUFFLEVBQTRFO0lBQ2xLLElBQUksY0FBNkIsQ0FBQztJQUNsQyxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7SUFDckIsT0FBTyw2QkFBNkIsQ0FBQztRQUNwQyxhQUFhLEVBQUU7WUFDZCxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQWdDLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQzNGLFlBQVksRUFBRSxDQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsRUFBRTtnQkFDeEMsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQ25DLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7b0JBQ3pCLElBQUksQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUNyQixhQUFhLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUE2QixDQUFDLENBQUM7b0JBQzFELENBQUM7b0JBQ0QsYUFBYSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBQ2hDLENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1NBQ0Q7S0FDRCxFQUFFLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxFQUFFO1FBQzVCLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEMsTUFBTSxhQUFhLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzdCLGNBQWMsR0FBRyxLQUFLLENBQUM7WUFDdkIsd0ZBQXdGO1lBQ3hGLEVBQUUsQ0FBQyxLQUFLLEVBQUUsYUFBYyxFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDbEIsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUN4QixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsTUFBTSxVQUFVLG9CQUFvQixDQUFhLFVBQTZDLEVBQUUsRUFBb0c7SUFDbk0sTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNwQyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsS0FBSyxFQUFFLGFBQWdCLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDOUUsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2QsRUFBRSxDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3pDLENBQUMsQ0FBQyxDQUFDO0lBQ0gsT0FBTztRQUNOLE9BQU87WUFDTixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDckIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLENBQUM7S0FDRCxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSxnQ0FBZ0MsQ0FBYSxVQUE2QyxFQUFFLEVBQStHO0lBQzFOLE9BQU8sb0JBQW9CLENBQUMsVUFBVSxFQUFFLENBQUMsS0FBSyxFQUFFLGFBQWEsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDL0UsRUFBRSxDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9