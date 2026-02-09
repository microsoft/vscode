/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { DebugLocation, derivedOpts, IObservable, IReader, observableFromEvent, observableFromEventOpts } from '../../../base/common/observable.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ContextKeyValue, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';

/** Creates an observable update when a configuration key updates. */
export function observableConfigValue<T>(
	key: string,
	defaultValue: T,
	configurationService: IConfigurationService,
	debugLocation = DebugLocation.ofCaller(),
): IObservable<T> {
	return observableFromEventOpts({ debugName: () => `Configuration Key "${key}"`, },
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key) ?? defaultValue,
		debugLocation,
	);
}

/** Update the configuration key with a value derived from observables. */
export function bindContextKey<T extends ContextKeyValue>(
	key: RawContextKey<T>,
	service: IContextKeyService,
	computeValue: (reader: IReader) => T,
	debugLocation = DebugLocation.ofCaller(),
): IDisposable {
	const boundKey = key.bindTo(service);
	const store = new DisposableStore();
	derivedOpts({ debugName: () => `Set Context Key "${key.key}"` }, reader => {
		const value = computeValue(reader);
		boundKey.set(value);
		return value;
	}, debugLocation).recomputeInitiallyAndOnChange(store);
	return store;
}


export function observableContextKey<T>(key: string, contextKeyService: IContextKeyService, debugLocation = DebugLocation.ofCaller()): IObservable<T | undefined> {
	return observableFromEvent(undefined, contextKeyService.onDidChangeContext, () => contextKeyService.getContextKeyValue<T>(key), debugLocation);
}
