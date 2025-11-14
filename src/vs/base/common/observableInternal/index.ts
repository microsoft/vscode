/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a facade for the observable implementation. Only import from here!

export { observableValueOpts } from './observables/observableValueOpts.js';
export { autorun, autorunDelta, autorunHandleChanges, autorunOpts, autorunWithStore, autorunWithStoreHandleChanges, autorunIterableDelta, autorunSelfDisposable } from './reactions/autorun.js';
export { type IObservable, type IObservableWithChange, type IObserver, type IReader, type ISettable, type ISettableObservable, type ITransaction } from './base.js';
export { disposableObservableValue } from './observables/observableValue.js';
export { derived, derivedDisposable, derivedHandleChanges, derivedOpts, derivedWithSetter, derivedWithStore } from './observables/derived.js';
export { type IDerivedReader } from './observables/derivedImpl.js';
export { ObservableLazy, ObservableLazyPromise, ObservablePromise, PromiseResult, } from './utils/promise.js';
export { derivedWithCancellationToken, waitForState } from './utils/utilsCancellation.js';
export {
	debouncedObservableDeprecated, debouncedObservable, derivedObservableWithCache,
	derivedObservableWithWritableCache, keepObserved, mapObservableArrayCached, observableFromPromise,
	recomputeInitiallyAndOnChange,
	signalFromObservable, wasEventTriggeredRecently,
} from './utils/utils.js';
export { type DebugOwner } from './debugName.js';
export { type IChangeContext, type IChangeTracker, recordChanges, recordChangesLazy } from './changeTracker.js';
export { constObservable } from './observables/constObservable.js';
export { type IObservableSignal, observableSignal } from './observables/observableSignal.js';
export { observableFromEventOpts } from './observables/observableFromEvent.js';
export { observableSignalFromEvent } from './observables/observableSignalFromEvent.js';
export { asyncTransaction, globalTransaction, subtransaction, transaction, TransactionImpl } from './transaction.js';
export { observableFromValueWithChangeEvent, ValueWithChangeEventFromObservable } from './utils/valueWithChangeEvent.js';
export { runOnChange, runOnChangeWithCancellationToken, runOnChangeWithStore, type RemoveUndefined } from './utils/runOnChange.js';
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
const enableLogging = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

if (enableLogging) {
	addLogger(new ConsoleObservableLogger());
}

if (env && env['VSCODE_DEV_DEBUG_OBSERVABLES']) {
	// To debug observables you also need the extension "ms-vscode.debug-value-editor"
	addLogger(DevToolsLogger.getInstance());
}
