/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Link } from '../../browser/link.js';
import { IOpenerService } from '../../common/opener.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { mainWindow } from '../../../../../base/browser/window.js';

suite('Link', () => {
	let linkContainer: HTMLElement;
	let instantiationService: TestInstantiationService;

	setup(() => {
		linkContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(linkContainer);

		instantiationService = new TestInstantiationService();
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(IOpenerService, {
			open: () => Promise.resolve(true)
		});
	});

	teardown(() => {
		linkContainer.remove();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Link should respond to Enter key', async () => {
		let activated = false;

		const link = instantiationService.createInstance(
			Link,
			linkContainer,
			{
				label: 'Test Link',
				href: 'test://link'
			},
			{
				opener: () => {
					activated = true;
				}
			}
		);

		const anchorElement = linkContainer.querySelector('a');
		assert.ok(anchorElement, 'Link element should exist');

		// Simulate Enter key press
		const enterEvent = new KeyboardEvent('keydown', {
			keyCode: KeyCode.Enter,
			code: 'Enter',
			key: 'Enter',
			bubbles: true,
			cancelable: true
		});

		anchorElement!.dispatchEvent(enterEvent);

		assert.strictEqual(activated, true, 'Link should be activated by Enter key');

		link.dispose();
	});

	test('Link should respond to Space key', async () => {
		let activated = false;

		const link = instantiationService.createInstance(
			Link,
			linkContainer,
			{
				label: 'Test Link',
				href: 'test://link'
			},
			{
				opener: () => {
					activated = true;
				}
			}
		);

		const anchorElement = linkContainer.querySelector('a');
		assert.ok(anchorElement, 'Link element should exist');

		// Simulate Space key press
		const spaceEvent = new KeyboardEvent('keydown', {
			keyCode: KeyCode.Space,
			code: 'Space',
			key: ' ',
			bubbles: true,
			cancelable: true
		});

		anchorElement!.dispatchEvent(spaceEvent);

		assert.strictEqual(activated, true, 'Link should be activated by Space key');

		link.dispose();
	});

	test('Link should respond to click', async () => {
		let activated = false;

		const link = instantiationService.createInstance(
			Link,
			linkContainer,
			{
				label: 'Test Link',
				href: 'test://link'
			},
			{
				opener: () => {
					activated = true;
				}
			}
		);

		const anchorElement = linkContainer.querySelector('a');
		assert.ok(anchorElement, 'Link element should exist');

		// Simulate click
		const clickEvent = new MouseEvent('click', {
			bubbles: true,
			cancelable: true
		});

		anchorElement!.dispatchEvent(clickEvent);

		assert.strictEqual(activated, true, 'Link should be activated by click');

		link.dispose();
	});

	test('Link should not activate when disabled', async () => {
		let activated = false;

		const link = instantiationService.createInstance(
			Link,
			linkContainer,
			{
				label: 'Test Link',
				href: 'test://link'
			},
			{
				opener: () => {
					activated = true;
				}
			}
		);

		link.enabled = false;

		const anchorElement = linkContainer.querySelector('a');
		assert.ok(anchorElement, 'Link element should exist');

		// Try to activate with Space key
		const spaceEvent = new KeyboardEvent('keydown', {
			keyCode: KeyCode.Space,
			code: 'Space',
			key: ' ',
			bubbles: true,
			cancelable: true
		});

		anchorElement!.dispatchEvent(spaceEvent);

		assert.strictEqual(activated, false, 'Disabled link should not be activated by Space key');

		link.dispose();
	});

	test('Link should have role=button', async () => {
		const link = instantiationService.createInstance(
			Link,
			linkContainer,
			{
				label: 'Test Link',
				href: 'test://link'
			}
		);

		const anchorElement = linkContainer.querySelector('a');
		assert.ok(anchorElement, 'Link element should exist');
		assert.strictEqual(anchorElement!.getAttribute('role'), 'button', 'Link should have role=button for accessibility');

		link.dispose();
	});
});
