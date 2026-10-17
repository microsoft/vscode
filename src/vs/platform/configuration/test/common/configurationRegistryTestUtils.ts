/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../registry/common/platform.js';
import { Extensions, IConfigurationDefaults, IConfigurationNode, IConfigurationRegistry } from '../../common/configurationRegistry.js';

/**
 * Records what the global configuration registry contains before the current suite, and restores it after the suite.
 * Modules register settings when they are loaded, and tests that run later in the same process rely on them.
 * @returns a function that empties the registry, for the tests of the suite that start from an empty registry
 */
export function restoreConfigurationRegistryAfterSuite(): () => void {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	let configurations: IConfigurationNode[] = [];
	let defaults: IConfigurationDefaults[] = [];

	const empty = () => {
		registry.deregisterConfigurations([...registry.getConfigurations()]);
		registry.deregisterDefaultConfigurations(registry.getRegisteredDefaultConfigurations());
	};

	suiteSetup(() => {
		configurations = [...registry.getConfigurations()];
		defaults = registry.getRegisteredDefaultConfigurations();
	});

	suiteTeardown(() => {
		empty();
		// The recorded configurations were validated when they were first registered
		registry.registerConfigurations(configurations, false);
		registry.registerDefaultConfigurations(defaults);
	});

	return empty;
}
