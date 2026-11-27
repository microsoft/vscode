/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../platform/extensions/common/extensions.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { getColorRegistry, workbenchColorsSchemaId } from '../../../../platform/theme/common/colorUtils.js';
import { getIconRegistry, iconsSchemaId } from '../../../../platform/theme/common/iconRegistry.js';
import { ExtensionMessageCollector, ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { workspaceConfigSchemaId } from '../../common/configurationExtensionPoint.js';

suite('Workspace file schema', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes when the icon or color schema changes, and accepts icons and colors registered after it loaded', () => {
		const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const changes: string[] = [];
		disposables.add(jsonRegistry.onDidChangeSchema(uri => changes.push(uri)));
		disposables.add(toDisposable(() => {
			getIconRegistry().deregisterIcon('test-workspace-icon');
			getColorRegistry().deregisterColor('test.workspaceColor');
		}));
		getIconRegistry().registerIcon('test-workspace-icon', { fontCharacter: '\\f8fe' });
		getColorRegistry().registerColor('test.workspaceColor', { dark: null, light: null, hcDark: null, hcLight: null }, 'Test color');

		const workspaceChanges = () => changes.filter(uri => uri === workspaceConfigSchemaId).length;
		const before = workspaceChanges();
		jsonRegistry.notifySchemaChanged(iconsSchemaId);
		const afterIcons = workspaceChanges();
		jsonRegistry.notifySchemaChanged(workbenchColorsSchemaId);
		const afterColors = workspaceChanges();

		const properties = jsonRegistry.getSchemaContributions().schemas[workspaceConfigSchemaId].properties!;
		assert.deepStrictEqual({
			afterIcons: afterIcons - before,
			afterColors: afterColors - before,
			icon: properties.icon.enum?.includes('test-workspace-icon'),
			color: (properties.color.anyOf![0] as IJSONSchema).enum?.includes('test.workspaceColor'),
		}, { afterIcons: 1, afterColors: 2, icon: true, color: true });
	});
});

suite('Configuration extension point', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		ExtensionsRegistry.getExtensionPoints().find(point => point.name === 'configuration')!.acceptUsers([]);
	});

	test('strips the internal agentsMode property from extension settings', () => {
		const description: IExtensionDescription = {
			identifier: new ExtensionIdentifier('test.agenticmode'),
			name: 'agenticmode',
			publisher: 'test',
			version: '1.0.0',
			engines: { vscode: '*' },
			targetPlatform: TargetPlatform.UNDEFINED,
			isBuiltin: false,
			isUserBuiltin: false,
			isUnderDevelopment: false,
			preRelease: false,
			extensionLocation: URI.file('/extensions/test.agenticmode'),
		};
		const errors: string[] = [];
		ExtensionsRegistry.getExtensionPoints().find(point => point.name === 'configuration')!.acceptUsers([{
			description,
			value: { properties: { 'test.agentsMode.setting': { type: 'boolean', default: false, agentsMode: { default: true } } } },
			collector: new ExtensionMessageCollector(message => errors.push(message.message), description, 'configuration'),
		}]);

		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()['test.agentsMode.setting'];
		assert.deepStrictEqual({ agentsMode: property.agentsMode, errors }, {
			agentsMode: undefined,
			errors: [`Extension 'test.agenticmode' CANNOT use the 'agentsMode' property on configuration 'test.agentsMode.setting'.`],
		});
	});
});
