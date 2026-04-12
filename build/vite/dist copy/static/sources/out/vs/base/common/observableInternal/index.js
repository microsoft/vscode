/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// This is a facade for the observable implementation. Only import from here!
export { observableValueOpts } from './observables/observableValueOpts.js';
export { autorun, autorunDelta, autorunHandleChanges, autorunOpts, autorunWithStore, autorunWithStoreHandleChanges, autorunIterableDelta, autorunSelfDisposable } from './reactions/autorun.js';
export { disposableObservableValue } from './observables/observableValue.js';
export { derived, derivedDisposable, derivedHandleChanges, derivedOpts, derivedWithSetter, derivedWithStore } from './observables/derived.js';
export { ObservableLazy, ObservableLazyPromise, ObservablePromise, PromiseResult, } from './utils/promise.js';
export { derivedWithCancellationToken, waitForState } from './utils/utilsCancellation.js';
export { debouncedObservable, debouncedObservable2, derivedObservableWithCache, derivedObservableWithWritableCache, keepObserved, mapObservableArrayCached, observableFromPromise, recomputeInitiallyAndOnChange, signalFromObservable, wasEventTriggeredRecently, isObservable, } from './utils/utils.js';
export { recordChanges, recordChangesLazy } from './changeTracker.js';
export { constObservable } from './observables/constObservable.js';
export { observableSignal } from './observables/observableSignal.js';
export { observableFromEventOpts } from './observables/observableFromEvent.js';
export { observableSignalFromEvent } from './observables/observableSignalFromEvent.js';
export { asyncTransaction, globalTransaction, subtransaction, transaction, TransactionImpl } from './transaction.js';
export { observableFromValueWithChangeEvent, ValueWithChangeEventFromObservable } from './utils/valueWithChangeEvent.js';
export { runOnChange, runOnChangeWithCancellationToken, runOnChangeWithStore } from './utils/runOnChange.js';
export { derivedConstOnceDefined, latestChangedValue } from './experimental/utils.js';
export { observableFromEvent } from './observables/observableFromEvent.js';
export { observableValue } from './observables/observableValue.js';
export { ObservableSet } from './set.js';
export { ObservableMap } from './map.js';
export { DebugLocation } from './debugLocation.js';
import { addLogger, setLogObservableFn } from './logging/logging.js';
import { ConsoleObservableLogger, logObservableToConsole } from './logging/consoleObservableLogger.js';
import { DevToolsLogger } from './logging/debugger/devToolsLogger.js';
import { env } from '../process.js';
import { _setDebugGetObservableGraph } from './observables/baseObservable.js';
import { debugGetObservableGraph } from './logging/debugGetDependencyGraph.js';
_setDebugGetObservableGraph(debugGetObservableGraph);
setLogObservableFn(logObservableToConsole);
// Remove "//" in the next line to enable logging
const enableLogging = false;
if (enableLogging) {
    addLogger(new ConsoleObservableLogger());
}
if (env && env['VSCODE_DEV_DEBUG_OBSERVABLES']) {
    // To debug observables you also need the extension "ms-vscode.debug-value-editor"
    addLogger(DevToolsLogger.getInstance());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsNkVBQTZFO0FBRTdFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSw2QkFBNkIsRUFBRSxvQkFBb0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRWhNLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFOUksT0FBTyxFQUFFLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUM5RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsWUFBWSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDMUYsT0FBTyxFQUNOLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLDBCQUEwQixFQUNyRSxrQ0FBa0MsRUFBRSxZQUFZLEVBQUUsd0JBQXdCLEVBQUUscUJBQXFCLEVBQ2pHLDZCQUE2QixFQUM3QixvQkFBb0IsRUFBRSx5QkFBeUIsRUFDL0MsWUFBWSxHQUNaLE1BQU0sa0JBQWtCLENBQUM7QUFFMUIsT0FBTyxFQUE0QyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNoSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUEwQixnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3JILE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxXQUFXLEVBQUUsZ0NBQWdDLEVBQUUsb0JBQW9CLEVBQXdCLE1BQU0sd0JBQXdCLENBQUM7QUFDbkksT0FBTyxFQUFFLHVCQUF1QixFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDekMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUN6QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3BDLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRS9FLDJCQUEyQixDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDckQsa0JBQWtCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztBQUUzQyxpREFBaUQ7QUFDakQsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUV6QjtBQUVGLElBQUksYUFBYSxFQUFFLENBQUM7SUFDbkIsU0FBUyxDQUFDLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBQzFDLENBQUM7QUFFRCxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsOEJBQThCLENBQUMsRUFBRSxDQUFDO0lBQ2hELGtGQUFrRjtJQUNsRixTQUFTLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFDekMsQ0FBQyJ9