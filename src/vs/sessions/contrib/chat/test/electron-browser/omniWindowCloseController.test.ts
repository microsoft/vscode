/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOmniInputWindow, IOmniOwnerWindow, OmniWindowCloseController } from '../../electron-browser/omniWindowCloseController.js';

suite('OmniWindowCloseController', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestServices() {
		const onDidChangeOpen = disposables.add(new Emitter<boolean>());
		const onDidFocus = disposables.add(new Emitter<void>());
		let isOpen = true;
		let hideCount = 0;
		let closeCount = 0;
		const omniInputWindow: IOmniInputWindow = {
			get isOpen() { return isOpen; },
			onDidChangeOpen: onDidChangeOpen.event,
		};
		const ownerWindow: IOmniOwnerWindow = {
			onDidFocus: onDidFocus.event,
			hide: async () => { hideCount++; },
			close: async () => { closeCount++; },
		};
		return {
			omniInputWindow,
			ownerWindow,
			closeOmni: () => {
				isOpen = false;
				onDidChangeOpen.fire(false);
			},
			focusOwner: () => onDidFocus.fire(),
			counts: () => ({ hideCount, closeCount }),
		};
	}

	test('keeps the hidden owner alive until Omni closes', async () => {
		const services = createTestServices();
		const controller = disposables.add(new OmniWindowCloseController(services.omniInputWindow, services.ownerWindow));

		const veto = await controller.preserveOmniOnOwnerClose();
		const afterHide = services.counts();
		services.closeOmni();

		assert.deepStrictEqual({
			veto,
			afterHide,
			afterOmniClose: services.counts(),
		}, {
			veto: true,
			afterHide: { hideCount: 1, closeCount: 0 },
			afterOmniClose: { hideCount: 1, closeCount: 1 },
		});
	});

	test('does not close a refocused owner when Omni closes', async () => {
		const services = createTestServices();
		const controller = disposables.add(new OmniWindowCloseController(services.omniInputWindow, services.ownerWindow));

		const veto = await controller.preserveOmniOnOwnerClose();
		services.focusOwner();
		services.closeOmni();

		assert.deepStrictEqual({
			veto,
			counts: services.counts(),
		}, {
			veto: true,
			counts: { hideCount: 1, closeCount: 0 },
		});
	});

	test('does not veto when Omni is closed', async () => {
		const services = createTestServices();
		services.closeOmni();
		const controller = disposables.add(new OmniWindowCloseController(services.omniInputWindow, services.ownerWindow));

		assert.deepStrictEqual({
			veto: await controller.preserveOmniOnOwnerClose(),
			counts: services.counts(),
		}, {
			veto: false,
			counts: { hideCount: 0, closeCount: 0 },
		});
	});
});
