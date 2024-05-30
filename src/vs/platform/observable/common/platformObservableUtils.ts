/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { autorunOpts, IObservable, IReader, observableFromEvent } from 'vs/base/common/observable';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyValue, RawContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

/** Creates an observable update when a configuration key updates. */
export function observableConfigValue<T>(key: string, defaultValue: T, configurationService: IConfigurationService): IObservable<T> {
	return observableFromEvent(
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key) ?? defaultValue
	);
}

/** Update the configuration key with a value derived from observables. */
export function bindContextKey<T extends ContextKeyValue>(key: RawContextKey<T>, service: IContextKeyService, computeValue: (reader: IReader) => T): IDisposable {
	const boundKey = key.bindTo(service);
	return autorunOpts({ debugName: () => `Set Context Key "${key.key}"` }, reader => {
		boundKey.set(computeValue(reader));
	});
}

