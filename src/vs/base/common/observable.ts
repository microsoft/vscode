/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a facade for the observable implementation. Only import from here!

export type {
	IObservable,
	IObserver,
	IReader,
	ISettable,
	ISettableObservable,
	ITransaction,
	IChangeContext,
	IChangeTracker,
} from './observableInternal/base.js';

export {
	observableValue,
	disposableObservableValue,
	transaction,
	subtransaction,
} from './observableInternal/base.js';
export {
	derived,
	derivedOpts,
	derivedHandleChanges,
	derivedWithStore,
} from './observableInternal/derived.js';
export {
	autorun,
	autorunDelta,
	autorunHandleChanges,
	autorunWithStore,
	autorunOpts,
	autorunWithStoreHandleChanges,
} from './observableInternal/autorun.js';
export type {
	IObservableSignal,
} from './observableInternal/utils.js';
export {
	constObservable,
	debouncedObservable,
	derivedObservableWithCache,
	derivedObservableWithWritableCache,
	keepObserved,
	recomputeInitiallyAndOnChange,
	observableFromEvent,
	observableFromPromise,
	observableSignal,
	observableSignalFromEvent,
	wasEventTriggeredRecently,
} from './observableInternal/utils.js';
export {
	ObservableLazy,
	ObservableLazyPromise,
	ObservablePromise,
	PromiseResult,
	waitForState,
	derivedWithCancellationToken,
} from './observableInternal/promise.js';
export {
	observableValueOpts
} from './observableInternal/api.js';

import { ConsoleObservableLogger, setLogger } from './observableInternal/logging.js';

// Remove "//" in the next line to enable logging
const enableLogging = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

if (enableLogging) {
	setLogger(new ConsoleObservableLogger());
}
