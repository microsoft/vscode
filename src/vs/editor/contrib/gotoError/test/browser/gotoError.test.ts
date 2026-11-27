/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { Position } from '../../../../common/core/position.js';
import { withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { MarkerController } from '../../browser/gotoError.js';
import { IMarkerNavigationService, MarkerList } from '../../browser/markerNavigationService.js';

suite('MarkerController', function () {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('navigate without peek widget moves cursor to marker', async () => {
		const markerService = disposables.add(new MarkerService());
		// Initialize config with the settings we need using direct dot notation
		const configService = new TestConfigurationService({
			'editor.markers.showPeekWidget': false,
			'problems.sortOrder': 'position'
		});

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IMarkerService, markerService);
		serviceCollection.set(IConfigurationService, configService);
		serviceCollection.set(IMarkerNavigationService, {
			_serviceBrand: undefined,
			registerProvider: () => ({ dispose: () => { } }),
			getMarkerList: (resource) => new MarkerList(resource, markerService, configService)
		});

		await withAsyncTestCodeEditor([
			'line 1',
			'line 2 with error',
			'line 3'
		], { serviceCollection }, async (editor) => {
			const model = editor.getModel()!;
			const uri = model.uri;

			// Set initial cursor position to line 3 (after the marker)
			editor.setPosition(new Position(3, 1));

			// Add a single marker
			markerService.changeOne('test', uri, [
				{
					startLineNumber: 2,
					startColumn: 1,
					endLineNumber: 2,
					endColumn: 10,
					message: 'Error message',
					severity: MarkerSeverity.Error
				}
			]);

			const controller = editor.registerAndInstantiateContribution(MarkerController.ID, MarkerController);

			// Initial position should be at line 3
			assert.strictEqual(editor.getPosition()?.lineNumber, 3, 'Initial position should be line 3');

			// Navigate backwards to find the marker
			await controller.navigate(false, false);

			// Cursor should have moved to line 2 (the marker location)
			const position = editor.getPosition();
			assert.strictEqual(position?.lineNumber, 2, 'After navigation, cursor should be at line 2');
		});
	});
});
