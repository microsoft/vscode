/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../../base/common/arrays.js';
import { createCommandUri } from '../../../../../base/common/htmlContent.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const ManagedPluginsUnavailableContext = new RawContextKey<boolean>('managedPluginsUnavailable', false);
export const MANAGED_PLUGINS_VIEW_ID = 'workbench.panel.chat.requiredPlugins';
export const RETRY_MANAGED_PLUGINS_COMMAND_ID = 'workbench.action.chat.retryRequiredPlugins';

export interface IManagedPluginAvailability {
	readonly kind: 'installing' | 'unavailable';
	readonly pluginIds: readonly string[];
}

export interface IManagedPluginBlockInfo {
	readonly title: string;
	readonly message: string;
	readonly detail: string;
	readonly action: { readonly label: string; readonly href: string } | undefined;
}

export const IManagedPluginAvailabilityService = createDecorator<IManagedPluginAvailabilityService>('managedPluginAvailabilityService');

export interface IManagedPluginAvailabilityService {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<IManagedPluginAvailability | undefined>;
	setState(state: IManagedPluginAvailability | undefined): void;
}

export class ManagedPluginAvailabilityService implements IManagedPluginAvailabilityService {
	declare readonly _serviceBrand: undefined;

	private readonly _state = observableValue<IManagedPluginAvailability | undefined>(this, undefined);
	readonly state: IObservable<IManagedPluginAvailability | undefined> = this._state;

	setState(state: IManagedPluginAvailability | undefined): void {
		const current = this._state.get();
		if (current?.kind === state?.kind && equals(current?.pluginIds ?? [], state?.pluginIds ?? [])) {
			return;
		}
		this._state.set(state, undefined);
	}
}

registerSingleton(IManagedPluginAvailabilityService, ManagedPluginAvailabilityService, InstantiationType.Delayed);

export function getManagedPluginBlockInfo(state: IManagedPluginAvailability): IManagedPluginBlockInfo {
	const installing = state.kind === 'installing';
	return {
		title: installing
			? localize('managedPlugins.installing.title', "Installing required plugins")
			: localize('managedPlugins.unavailable.title', "Required plugins unavailable"),
		message: installing
			? localize('managedPlugins.installing.message', "Your organization requires these plugins before you can use chat. You can continue when installation finishes.")
			: localize('managedPlugins.unavailable.message', "Your organization requires plugins that could not be installed. Retry, or contact your administrator if the issue persists."),
		detail: localize('managedPlugins.required', "Required: {0}", state.pluginIds.join(', ')),
		action: installing ? undefined : {
			label: localize('managedPlugins.retry', "Retry"),
			href: createCommandUri(RETRY_MANAGED_PLUGINS_COMMAND_ID).toString(),
		},
	};
}
