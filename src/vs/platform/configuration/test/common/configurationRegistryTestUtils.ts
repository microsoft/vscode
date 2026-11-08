/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../registry/common/platform.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry, IRegisteredConfigurationPropertySchema } from '../../common/configurationRegistry.js';

/**
 * A setting hidden with `included: false` that its configuration node no longer contains.
 */
interface IHiddenSetting {
	readonly node: IConfigurationNode;
	readonly key: string;
	readonly property: IRegisteredConfigurationPropertySchema;
}

function emptyConfigurationRegistry(registry: IConfigurationRegistry): void {
	// Deregistering a default override resets the default of the setting it overrides, so do it while the settings are registered
	registry.deregisterDefaultConfigurations(registry.getRegisteredDefaultConfigurations());
	registry.deregisterConfigurations([...registry.getConfigurations()]);
}

/**
 * Registering a configuration node removes its hidden settings from the node, and deregistering the node forgets the
 * ones that it mirrors to Agent Hosts or that experiments use.
 * @returns those hidden settings, with the node that registered them
 */
function getForgettableHiddenSettings(registry: IConfigurationRegistry, configurations: readonly IConfigurationNode[]): IHiddenSetting[] {
	const nodes: IConfigurationNode[] = [];
	const addNodes = (configuration: IConfigurationNode) => {
		nodes.push(configuration);
		configuration.allOf?.forEach(addNodes);
	};
	configurations.forEach(addNodes);

	const visible = registry.getConfigurationProperties();
	const mirrored = registry.getAgentHostSyncConfigurations();
	const result: IHiddenSetting[] = [];
	for (const [key, property] of Object.entries(registry.getExcludedConfigurationProperties())) {
		if (visible[key] || !(property.experiment || property.agentHost && mirrored.has(key))) {
			continue;
		}
		// The registry does not expose which node registered a setting, but it records the node's section on the setting.
		// Nodes can share a section (nodes without an id, or several with the same id), so this can pick another node with
		// the same section. The setting then belongs to that node, which only matters when one of the two is deregistered
		// on its own: tests only do that with nodes they registered themselves.
		const { section } = property;
		const node = nodes.find(node => node.id === section?.id && node.title === section?.title && node.order === section?.order && node.extensionInfo === section?.extensionInfo);
		if (node) {
			result.push({ node, key, property });
		}
	}
	return result;
}

/**
 * Records what the global configuration registry contains.
 * @returns a function that empties the registry and registers what it contained again
 */
export function recordConfigurationRegistry(): () => void {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const configurations = [...registry.getConfigurations()];
	const defaults = registry.getRegisteredDefaultConfigurations();
	const hiddenSettings = getForgettableHiddenSettings(registry, configurations);

	return () => {
		emptyConfigurationRegistry(registry);
		for (const { node, key, property } of hiddenSettings) {
			// Registration reads the declared default from `default`, which a default override may have replaced
			property.default = property.defaultDefaultValue;
			node.properties ??= {};
			node.properties[key] = property;
		}
		// The recorded configurations were validated when they were first registered
		registry.registerConfigurations(configurations, false);
		registry.registerDefaultConfigurations(defaults);
	};
}

/**
 * Records what the global configuration registry contains before the current suite, and restores it after the suite.
 * Modules register settings when they are loaded, and tests that run later in the same process rely on them.
 * @returns a function that empties the registry, for the tests of the suite that start from an empty registry
 */
export function restoreConfigurationRegistryAfterSuite(): () => void {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	let restore: (() => void) | undefined;

	suiteSetup(() => {
		restore = recordConfigurationRegistry();
	});

	suiteTeardown(() => {
		restore?.();
	});

	return () => emptyConfigurationRegistry(registry);
}
