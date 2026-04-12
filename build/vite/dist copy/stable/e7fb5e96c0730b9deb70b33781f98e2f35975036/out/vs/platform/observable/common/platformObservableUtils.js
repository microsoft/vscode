/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { DebugLocation, derivedOpts, observableFromEvent, observableFromEventOpts } from '../../../base/common/observable.js';
/** Creates an observable update when a configuration key updates. */
export function observableConfigValue(key, defaultValue, configurationService, debugLocation = DebugLocation.ofCaller()) {
    return observableFromEventOpts({ debugName: () => `Configuration Key "${key}"`, }, (handleChange) => configurationService.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(key)) {
            handleChange(e);
        }
    }), () => configurationService.getValue(key) ?? defaultValue, debugLocation);
}
/** Update the configuration key with a value derived from observables. */
export function bindContextKey(key, service, computeValue, debugLocation = DebugLocation.ofCaller()) {
    const boundKey = key.bindTo(service);
    const store = new DisposableStore();
    derivedOpts({ debugName: () => `Set Context Key "${key.key}"` }, reader => {
        const value = computeValue(reader);
        boundKey.set(value);
        return value;
    }, debugLocation).recomputeInitiallyAndOnChange(store);
    return store;
}
export function observableContextKey(key, contextKeyService, debugLocation = DebugLocation.ofCaller()) {
    return observableFromEvent(undefined, contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue(key), debugLocation);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQXdCLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFJcEoscUVBQXFFO0FBQ3JFLE1BQU0sVUFBVSxxQkFBcUIsQ0FDcEMsR0FBVyxFQUNYLFlBQWUsRUFDZixvQkFBMkMsRUFDM0MsYUFBYSxHQUFHLGFBQWEsQ0FBQyxRQUFRLEVBQUU7SUFFeEMsT0FBTyx1QkFBdUIsQ0FBQyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxzQkFBc0IsR0FBRyxHQUFHLEdBQUcsRUFDaEYsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ25FLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDakMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLENBQUM7SUFDRixDQUFDLENBQUMsRUFDRixHQUFHLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUksR0FBRyxDQUFDLElBQUksWUFBWSxFQUMzRCxhQUFhLENBQ2IsQ0FBQztBQUNILENBQUM7QUFFRCwwRUFBMEU7QUFDMUUsTUFBTSxVQUFVLGNBQWMsQ0FDN0IsR0FBcUIsRUFDckIsT0FBMkIsRUFDM0IsWUFBb0MsRUFDcEMsYUFBYSxHQUFHLGFBQWEsQ0FBQyxRQUFRLEVBQUU7SUFFeEMsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNyQyxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQ3BDLFdBQVcsQ0FBQyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxvQkFBb0IsR0FBRyxDQUFDLEdBQUcsR0FBRyxFQUFFLEVBQUUsTUFBTSxDQUFDLEVBQUU7UUFDekUsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25DLFFBQVEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEIsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDO0FBR0QsTUFBTSxVQUFVLG9CQUFvQixDQUFJLEdBQVcsRUFBRSxpQkFBcUMsRUFBRSxhQUFhLEdBQUcsYUFBYSxDQUFDLFFBQVEsRUFBRTtJQUNuSSxPQUFPLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBSSxHQUFHLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztBQUNoSixDQUFDIn0=