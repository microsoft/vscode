/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ImplicitActivationEvents } from '../../../../../platform/extensionManagement/common/implicitActivationEvents.js';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import '../../browser/notebookExtensionPoint.js';

suite('Notebook Extension Point', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('generates notebook serializer activation events before notebook service construction', () => {
		const extension: IExtensionDescription = {
			name: 'notebook',
			publisher: 'test',
			version: '0.0.0',
			engines: { vscode: '^1.0.0' },
			identifier: new ExtensionIdentifier('test.notebook'),
			extensionLocation: URI.parse('test://notebook'),
			isBuiltin: false,
			isUnderDevelopment: false,
			isUserBuiltin: false,
			activationEvents: ['onNotebook:github-issues'],
			main: 'index.js',
			targetPlatform: TargetPlatform.UNDEFINED,
			extensionDependencies: [],
			enabledApiProposals: undefined,
			preRelease: false,
			contributes: {
				notebooks: [{
					type: 'github-issues',
					selector: [{ filenamePattern: '*.github-issues' }]
				}]
			}
		};

		assert.deepStrictEqual(
			ImplicitActivationEvents.createActivationEventsMap([extension])['test.notebook'],
			['onNotebook:github-issues', 'onNotebookSerializer:github-issues']
		);
	});
});
