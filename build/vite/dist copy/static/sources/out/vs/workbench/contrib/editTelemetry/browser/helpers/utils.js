/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, runOnChange, transaction } from '../../../../../base/common/observable.js';
export function sumByCategory(items, getValue, getCategory) {
    return items.reduce((acc, item) => {
        const category = getCategory(item);
        acc[category] = (acc[category] || 0) + getValue(item);
        return acc;
        // eslint-disable-next-line local/code-no-any-casts
    }, {});
}
export function mapObservableDelta(obs, mapFn, store) {
    const obsResult = observableValue('mapped', obs.get());
    store.add(runOnChange(obs, (value, _prevValue, changes) => {
        transaction(tx => {
            for (const c of changes) {
                obsResult.set(value, tx, mapFn(c));
            }
        });
    }));
    return obsResult;
}
export function iterateObservableChanges(obs, store) {
    return new AsyncIterableProducer((e) => {
        if (store.isDisposed) {
            return;
        }
        store.add(runOnChange(obs, (value, prevValue, change) => {
            e.emitOne({ value, prevValue, change: change });
        }));
        return new Promise((res) => {
            store.add(toDisposable(() => {
                res(undefined);
            }));
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvaGVscGVycy91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RSxPQUFPLEVBQW1CLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBeUIsZUFBZSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQW1CLE1BQU0sMENBQTBDLENBQUM7QUFFN0ksTUFBTSxVQUFVLGFBQWEsQ0FBOEIsS0FBbUIsRUFBRSxRQUE2QixFQUFFLFdBQW1DO0lBQ2pKLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsRUFBRTtRQUNqQyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0RCxPQUFPLEdBQUcsQ0FBQztRQUNYLG1EQUFtRDtJQUNwRCxDQUFDLEVBQUUsRUFBc0MsQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQXVCLEdBQXFDLEVBQUUsS0FBbUMsRUFBRSxLQUFzQjtJQUMxSixNQUFNLFNBQVMsR0FBRyxlQUFlLENBQWUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLEVBQUU7UUFDekQsV0FBVyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2hCLEtBQUssTUFBTSxDQUFDLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ3pCLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELE1BQU0sVUFBVSx3QkFBd0IsQ0FBYSxHQUFzQyxFQUFFLEtBQXNCO0lBQ2xILE9BQU8sSUFBSSxxQkFBcUIsQ0FBaUUsQ0FBQyxDQUFDLEVBQUUsRUFBRTtRQUN0RyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDdkQsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUMxQixLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7Z0JBQzNCLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNoQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMifQ==