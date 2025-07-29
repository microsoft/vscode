/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { ExtensionDescriptionRegistry, IActivationEventsReader } from '../../common/extensionDescriptionRegistry.js';

suite('ExtensionDescriptionRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('allow removing and adding the same extension at a different version', () => {
		const idA = new ExtensionIdentifier('a');
		const extensionA1 = desc(idA, '1.0.0');
		const extensionA2 = desc(idA, '2.0.0');

		const basicActivationEventsReader: IActivationEventsReader = {
			readActivationEvents: (extensionDescription: IExtensionDescription): string[] => {
				return extensionDescription.activationEvents ?? [];
			}
		};

		const registry = new ExtensionDescriptionRegistry(basicActivationEventsReader, [extensionA1]);
		registry.deltaExtensions([extensionA2], [idA]);

		assert.deepStrictEqual(registry.getAllExtensionDescriptions(), [extensionA2]);

		registry.dispose();
	});

	function desc(id: ExtensionIdentifier, version: string, activationEvents: string[] = ['*']): IExtensionDescription {
		return {
			name: id.value,
			publisher: 'test',
			version: '0.0.0',
			engines: { vscode: '^1.0.0' },
			identifier: id,
			extensionLocation: URI.parse(`nothing://nowhere`),
			isBuiltin: false,
			isUnderDevelopment: false,
			isUserBuiltin: false,
			activationEvents,
			main: 'index.js',
			targetPlatform: TargetPlatform.UNDEFINED,
			extensionDependencies: [],
			enabledApiProposals: undefined,
			preRelease: false,
		};
	}
});
