/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SimpleChatConfirmationWidget } from '../../browser/chatContentParts/chatConfirmationWidget.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';

suite('ChatConfirmationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		
		// Mock required services
		instantiationService.stub(IConfigurationService, {
			getValue: () => false // Disable notifications for test
		});
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IHostService, {});
		instantiationService.stub(IViewsService, {});
		instantiationService.stub(IContextKeyService, {
			createOverlay: () => ({})
		});
	});

	test('should initialize with hideButtons class to prevent premature notifications', () => {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		
		try {
			const widget = store.add(instantiationService.createInstance(
				SimpleChatConfirmationWidget,
				container,
				{
					title: 'Test Title',
					message: 'Test message',
					buttons: [
						{ label: 'Accept', data: 'accept' },
						{ label: 'Dismiss', data: 'dismiss', isSecondary: true }
					]
				}
			));

			// Verify the fix: domNode should have hideButtons class initially
			assert.ok(widget.domNode.classList.contains('hideButtons'), 
				'Widget should initialize with hideButtons class to prevent premature notifications');

			// Verify setShowButtons(true) removes the class properly
			widget.setShowButtons(true);
			assert.ok(!widget.domNode.classList.contains('hideButtons'), 
				'setShowButtons(true) should remove hideButtons class');

			// Verify setShowButtons(false) adds the class back
			widget.setShowButtons(false);
			assert.ok(widget.domNode.classList.contains('hideButtons'), 
				'setShowButtons(false) should add hideButtons class back');
				
		} finally {
			mainWindow.document.body.removeChild(container);
		}
	});
});