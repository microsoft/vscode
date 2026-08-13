/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getChatPetInputWindowBounds, isChatInputWindowModeEnabled } from '../../browser/chatInputWindow/chatInputWindowService.js';
import { clampRectangleToDisplays, getChatPetWireStateComparisonKey, placeRectangleAtPoint, selectChatPetState } from '../../electron-browser/chatPetDesktopService.js';

suite('DesktopChatPetService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	type WindowState = Parameters<typeof selectChatPetState>[0][number];

	function windowState(instanceId: string, overrides: Partial<WindowState> = {}): WindowState {
		return {
			type: 'state',
			instanceId,
			updatedAt: 100,
			focusOrder: 100,
			mainFocused: false,
			documentVisible: true,
			enabled: true,
			hosts: [],
			completionAt: 0,
			scale: 1,
			scaleUpdatedAt: 0,
			...overrides,
		};
	}

	test('selects confirmations before running chats and docks in the matching visible host', () => {
		const selected = selectChatPetState([
			windowState('running', {
				mainFocused: true,
				activity: { hasActiveRequest: true, needsInput: false, recency: 200, sessionResource: 'chat://running' },
				hosts: [{ id: 'running-host', visible: true, preferred: true, recency: 300, hasInput: false, sessionResource: 'chat://running' }],
			}),
			windowState('confirmation', {
				activity: { hasActiveRequest: true, needsInput: true, recency: 100, sessionResource: 'chat://confirmation' },
				hosts: [{ id: 'confirmation-host', visible: true, preferred: false, recency: 100, hasInput: false, sessionResource: 'chat://confirmation' }],
			}),
		]);

		assert.deepStrictEqual({
			ownerInstanceId: selected.ownerInstanceId,
			host: selected.host && { instanceId: selected.host.instanceId, id: selected.host.id },
			activity: selected.activity,
		}, {
			ownerInstanceId: 'confirmation',
			host: { instanceId: 'confirmation', id: 'confirmation-host' },
			activity: {
				hasActiveRequest: true,
				needsInput: true,
				hasInput: false,
				completionToken: undefined,
				sessionResource: 'chat://confirmation',
			},
		});

		test('ignores heartbeat timestamps when comparing cross-window state', () => {
			const first = windowState('window', { updatedAt: 100 });
			const heartbeat = windowState('window', { updatedAt: 200 });
			const changed = windowState('window', {
				updatedAt: 200,
				hosts: [{ id: 'host', visible: true, preferred: true, recency: 100, hasInput: false }],
			});

			assert.deepStrictEqual({
				heartbeatEqual: getChatPetWireStateComparisonKey(first) === getChatPetWireStateComparisonKey(heartbeat),
				materialChangeEqual: getChatPetWireStateComparisonKey(first) === getChatPetWireStateComparisonKey(changed),
			}, {
				heartbeatEqual: true,
				materialChangeEqual: false,
			});
		});
	});

	test('uses the last focused window as desktop owner while the workbench is inactive', () => {
		const selected = selectChatPetState([
			windowState('older', { focusOrder: 100, hosts: [{ id: 'older-host', visible: true, preferred: true, recency: 500, hasInput: false }] }),
			windowState('newer', { focusOrder: 200 }),
		]);

		assert.deepStrictEqual({
			ownerInstanceId: selected.ownerInstanceId,
			host: selected.host,
		}, {
			ownerInstanceId: 'newer',
			host: undefined,
		});
	});

	test('falls back to the most recent visible host when the actionable chat is hidden', () => {
		const selected = selectChatPetState([
			windowState('focused', {
				mainFocused: true,
				activity: { hasActiveRequest: true, needsInput: false, recency: 300, sessionResource: 'chat://hidden' },
				hosts: [
					{ id: 'older', visible: true, preferred: false, recency: 100, hasInput: false, sessionResource: 'chat://other' },
					{ id: 'newer', visible: true, preferred: true, recency: 200, hasInput: true, sessionResource: 'chat://newer' },
				],
			}),
		]);

		assert.deepStrictEqual({
			hostId: selected.host?.id,
			hasInput: selected.activity.hasInput,
			sessionResource: selected.activity.sessionResource,
		}, {
			hostId: 'newer',
			hasInput: false,
			sessionResource: 'chat://hidden',
		});
	});

	test('clamps restored positions to the nearest display across negative coordinates and gaps', () => {
		const displays = [
			{ x: -1920, y: 0, width: 1920, height: 1080 },
			{ x: 200, y: 0, width: 1920, height: 1080 },
		];

		assert.deepStrictEqual([
			clampRectangleToDisplays({ x: -2100, y: 1000, width: 192, height: 192 }, displays, displays[0]),
			clampRectangleToDisplays({ x: 40, y: 200, width: 192, height: 192 }, displays, displays[1]),
		], [
			{ x: -1920, y: 888, width: 192, height: 192 },
			{ x: 200, y: 200, width: 192, height: 192 },
		]);
	});

	test('places the pet composer beside the pet and flips at display edges', () => {
		const display = { x: 0, y: 0, width: 1200, height: 800 };

		assert.deepStrictEqual([
			getChatPetInputWindowBounds({ x: 100, y: 300, width: 192, height: 192 }, display, 420, 110),
			getChatPetInputWindowBounds({ x: 1000, y: 300, width: 192, height: 192 }, display, 420, 110),
		], [
			{ x: 300, y: 341, width: 420, height: 110 },
			{ x: 572, y: 341, width: 420, height: 110 },
		]);
	});

	test('places the measured context menu at the pointer and flips at display edges', () => {
		const display = { x: 0, y: 0, width: 1200, height: 800 };

		assert.deepStrictEqual([
			placeRectangleAtPoint(100, 100, 260, 300, display),
			placeRectangleAtPoint(1180, 780, 260, 300, display),
		], [
			{ x: 104, y: 104, width: 260, height: 300 },
			{ x: 916, y: 476, width: 260, height: 300 },
		]);
	});

	test('enables pet input independently from Omni while respecting AI hiding', () => {
		assert.deepStrictEqual([
			isChatInputWindowModeEnabled('omni', false, false),
			isChatInputWindowModeEnabled('pet', false, false),
			isChatInputWindowModeEnabled('pet', true, true),
		], [
			false,
			true,
			false,
		]);
	});
});
