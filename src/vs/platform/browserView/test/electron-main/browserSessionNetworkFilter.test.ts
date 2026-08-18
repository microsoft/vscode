/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { CallbackResponse, OnBeforeRequestListenerDetails } from 'electron';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentNetworkFilterService } from '../../../networkFilter/common/networkFilterService.js';
import { BrowserSessionNetworkFilter } from '../../electron-main/browserSessionNetworkFilter.js';

suite('BrowserSession network filter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createFilter(): { filter: BrowserSessionNetworkFilter; setDeniedAuthority(authority: string | undefined): void } {
		let deniedAuthority: string | undefined = 'denied.example';
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: uri => uri.authority !== deniedAuthority,
			formatError: uri => `Access to ${uri.authority} is blocked by network domain policy.`,
		};
		return {
			filter: new BrowserSessionNetworkFilter(networkFilter),
			setDeniedAuthority: authority => deniedAuthority = authority,
		};
	}

	function invokeRequest(filter: BrowserSessionNetworkFilter, details: Partial<OnBeforeRequestListenerDetails> & Pick<OnBeforeRequestListenerDetails, 'url' | 'resourceType'>): CallbackResponse {
		let result: CallbackResponse | undefined;
		filter.onBeforeRequest({
			id: 1,
			method: 'GET',
			referrer: '',
			timestamp: 0,
			uploadData: [],
			...details,
		}, response => result = response);
		assert.ok(result);
		return result;
	}

	test('filters shared webContents without affecting known unshared webContents', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		filter.registerWebContents(2);

		assert.deepStrictEqual({
			sharedDenied: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 }),
			unsharedDenied: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 2 }),
			sharedAllowed: invokeRequest(filter, { url: 'https://allowed.example/frame', resourceType: 'subFrame', webContentsId: 1 }),
			sharedNavigationPolicyError: filter.getPolicyError(1, true),
			sharedPolicyError: filter.getPolicyError(1),
			unsharedPolicyError: filter.getPolicyError(2),
		}, {
			sharedDenied: { cancel: true },
			unsharedDenied: { cancel: false },
			sharedAllowed: { cancel: false },
			sharedNavigationPolicyError: undefined,
			sharedPolicyError: 'Access to denied.example is blocked by network domain policy.',
			unsharedPolicyError: undefined,
		});
	});

	test('attributes ownerless worker requests using their referrer origin', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, { url: 'https://shared.example/page', resourceType: 'mainFrame', webContentsId: 1 });
		invokeRequest(filter, { url: 'https://unshared.example/page', resourceType: 'mainFrame', webContentsId: 2 });

		assert.deepStrictEqual({
			sharedWorkerDenied: invokeRequest(filter, { url: 'https://denied.example/worker', resourceType: 'xhr', referrer: 'https://shared.example/worker.js' }),
			unsharedWorkerDenied: invokeRequest(filter, { url: 'https://denied.example/worker', resourceType: 'xhr', referrer: 'https://unshared.example/worker.js' }),
			policyError: filter.getPolicyError(1),
		}, {
			sharedWorkerDenied: { cancel: true },
			unsharedWorkerDenied: { cancel: false },
			policyError: 'Access to denied.example is blocked by network domain policy.',
		});
	});

	test('fails closed for ownerless requests without attributing errors to unrelated views', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);

		assert.deepStrictEqual({
			missingOwnerDenied: invokeRequest(filter, { url: 'https://denied.example/worker', resourceType: 'xhr' }),
			invalidOwnerDenied: invokeRequest(filter, { url: 'https://denied.example/worker', resourceType: 'xhr', webContentsId: -1 }),
			missingOwnerAllowed: invokeRequest(filter, { url: 'https://allowed.example/worker', resourceType: 'xhr' }),
			policyError: filter.getPolicyError(1),
		}, {
			missingOwnerDenied: { cancel: true },
			invalidOwnerDenied: { cancel: true },
			missingOwnerAllowed: { cancel: false },
			policyError: undefined,
		});
	});

	test('unsharing disables filtering and clears retained policy errors', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });

		filter.setFiltering(1, false);

		assert.deepStrictEqual({
			request: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 }),
			policyError: filter.getPolicyError(1),
		}, {
			request: { cancel: false },
			policyError: undefined,
		});
	});

	test('main-frame navigation resets retained subframe errors and enforces policy while shared', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });

		const result = invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 1 });

		assert.deepStrictEqual({
			result,
			policyError: filter.getPolicyError(1),
		}, {
			result: { cancel: true },
			policyError: 'Access to denied.example is blocked by network domain policy.',
		});
	});

	test('filters shared and action-related main-frame requests without affecting known unshared views', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		filter.registerWebContents(2);
		invokeRequest(filter, { url: 'https://unshared.example/page', resourceType: 'mainFrame', webContentsId: 2 });

		const unsharedNavigation = invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 2 });
		const sharedNavigation = invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 1 });
		const sharedNavigationError = filter.getPolicyError(1);
		invokeRequest(filter, { url: 'https://allowed.example/page', resourceType: 'mainFrame', webContentsId: 1 });
		filter.setAgentAction(1, 'action', true);
		const unsharedRequestDuringAction = invokeRequest(filter, { url: 'https://denied.example/data', resourceType: 'xhr', webContentsId: 2, referrer: 'https://unshared.example/page' });
		const popupNavigation = invokeRequest(filter, { url: 'https://denied.example/popup', resourceType: 'mainFrame', webContentsId: 3 });
		const allowedReturnNavigation = invokeRequest(filter, { url: 'https://allowed.example/page', resourceType: 'mainFrame', webContentsId: 1 });
		const navigationOnlyActionError = filter.getPolicyError(1, true);
		const retainedActionError = filter.getPolicyError(1);
		filter.setAgentAction(1, 'action', false);

		assert.deepStrictEqual({
			unsharedNavigation,
			sharedNavigation,
			sharedNavigationError,
			unsharedRequestDuringAction,
			popupNavigation,
			allowedReturnNavigation,
			navigationOnlyActionError,
			retainedActionError,
			errorAfterAction: filter.getPolicyError(1),
		}, {
			unsharedNavigation: { cancel: false },
			sharedNavigation: { cancel: true },
			sharedNavigationError: 'Access to denied.example is blocked by network domain policy.',
			unsharedRequestDuringAction: { cancel: false },
			popupNavigation: { cancel: true },
			allowedReturnNavigation: { cancel: false },
			navigationOnlyActionError: undefined,
			retainedActionError: 'Access to denied.example is blocked by network domain policy.',
			errorAfterAction: undefined,
		});
	});

	test('allows a registered unshared view first navigation while unknown views fail closed', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		filter.registerWebContents(2);

		assert.deepStrictEqual({
			registeredUnshared: invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 2 }),
			unknownNavigation: invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 3 }),
			unknownBackgroundRequest: invokeRequest(filter, { url: 'https://denied.example/data', resourceType: 'xhr', webContentsId: 4 }),
			ownerlessBackgroundRequest: invokeRequest(filter, { url: 'https://denied.example/data', resourceType: 'xhr' }),
		}, {
			registeredUnshared: { cancel: false },
			unknownNavigation: { cancel: true },
			unknownBackgroundRequest: { cancel: true },
			ownerlessBackgroundRequest: { cancel: true },
		});
	});

	test('does not attribute known same-origin unshared requests to an agent action', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, { url: 'https://same.example/shared', resourceType: 'mainFrame', webContentsId: 1 });
		invokeRequest(filter, { url: 'https://same.example/unshared', resourceType: 'mainFrame', webContentsId: 2 });
		filter.setAgentAction(1, 'action', true);

		const unsharedRequest = invokeRequest(filter, {
			url: 'https://denied.example/data',
			resourceType: 'xhr',
			webContentsId: 2,
			referrer: 'https://same.example/unshared',
		});
		const unsharedNavigation = invokeRequest(filter, {
			url: 'https://denied.example/page',
			resourceType: 'mainFrame',
			webContentsId: 2,
			referrer: 'https://same.example/unshared',
		});

		assert.deepStrictEqual({
			unsharedRequest,
			unsharedNavigation,
			actionPolicyError: filter.getPolicyError(1),
		}, {
			unsharedRequest: { cancel: false },
			unsharedNavigation: { cancel: false },
			actionPolicyError: undefined,
		});
	});

	test('keeps derived popup filtering until the tracked opener is released', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		filter.setAgentAction(1, 'action', true);
		const allowedPopup = invokeRequest(filter, {
			url: 'https://allowed.example/popup',
			resourceType: 'mainFrame',
			webContentsId: 3,
			referrer: 'https://allowed.example/opener',
		});
		filter.setAgentAction(1, 'action', false);

		const delayedDeniedNavigation = invokeRequest(filter, {
			url: 'https://denied.example/delayed',
			resourceType: 'mainFrame',
			webContentsId: 3,
			referrer: 'https://allowed.example/popup',
		});
		filter.setFiltering(1, false);
		const navigationAfterOpenerRelease = invokeRequest(filter, {
			url: 'https://denied.example/after-release',
			resourceType: 'mainFrame',
			webContentsId: 3,
			referrer: 'https://allowed.example/popup',
		});

		assert.deepStrictEqual({
			allowedPopup,
			delayedDeniedNavigation,
			navigationAfterOpenerRelease,
		}, {
			allowedPopup: { cancel: false },
			delayedDeniedNavigation: { cancel: true },
			navigationAfterOpenerRelease: { cancel: false },
		});
	});

	test('preserves tracked root ownership across nested popups without an active action', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, {
			url: 'https://allowed.example/opener',
			resourceType: 'mainFrame',
			webContentsId: 1,
		});

		const allowedPopup = invokeRequest(filter, {
			url: 'https://allowed.example/popup',
			resourceType: 'mainFrame',
			webContentsId: 3,
			referrer: 'https://allowed.example/opener',
		});
		const allowedNestedPopup = invokeRequest(filter, {
			url: 'https://allowed.example/nested-popup',
			resourceType: 'mainFrame',
			webContentsId: 4,
			referrer: 'https://allowed.example/popup',
		});
		const delayedDeniedNavigation = invokeRequest(filter, {
			url: 'https://denied.example/delayed',
			resourceType: 'mainFrame',
			webContentsId: 4,
			referrer: 'https://allowed.example/nested-popup',
		});

		assert.deepStrictEqual({
			allowedPopup,
			allowedNestedPopup,
			delayedDeniedNavigation,
		}, {
			allowedPopup: { cancel: false },
			allowedNestedPopup: { cancel: false },
			delayedDeniedNavigation: { cancel: true },
		});
	});

	test('uses the webContents object when webContentsId is omitted', () => {
		const { filter } = createFilter();
		const webContents = { id: 1, once: () => { } } as unknown as Electron.WebContents;
		filter.setFiltering(1, true);

		const deniedSubframe = invokeRequest(filter, {
			url: 'https://denied.example/frame',
			resourceType: 'subFrame',
			webContents,
		});
		const retainedPolicyError = filter.getPolicyError(1);
		const mainFrame = invokeRequest(filter, {
			url: 'https://denied.example/page',
			resourceType: 'mainFrame',
			webContents,
		});

		assert.deepStrictEqual({
			deniedSubframe,
			retainedPolicyError,
			mainFrame,
			policyErrorAfterNavigation: filter.getPolicyError(1),
		}, {
			deniedSubframe: { cancel: true },
			retainedPolicyError: 'Access to denied.example is blocked by network domain policy.',
			mainFrame: { cancel: true },
			policyErrorAfterNavigation: 'Access to denied.example is blocked by network domain policy.',
		});
	});

	test('uses current network policy for every request', () => {
		const { filter, setDeniedAuthority } = createFilter();
		filter.setFiltering(1, true);

		const initiallyDenied = invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });
		const retainedErrorWhileDenied = filter.getPolicyError(1);
		setDeniedAuthority(undefined);
		const allowedAfterPolicyChange = invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });
		const retainedErrorAfterPolicyChange = filter.getPolicyError(1);

		assert.deepStrictEqual({ initiallyDenied, retainedErrorWhileDenied, allowedAfterPolicyChange, retainedErrorAfterPolicyChange }, {
			initiallyDenied: { cancel: true },
			retainedErrorWhileDenied: 'Access to denied.example is blocked by network domain policy.',
			allowedAfterPolicyChange: { cancel: false },
			retainedErrorAfterPolicyChange: undefined,
		});
	});

	test('fails closed for malformed requests owned by a shared view', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);

		assert.deepStrictEqual({
			request: invokeRequest(filter, { url: 'not a uri', resourceType: 'subFrame', webContentsId: 1 }),
			policyError: filter.getPolicyError(1),
		}, {
			request: { cancel: true },
			policyError: 'A browser request was blocked by network domain policy.',
		});
	});
});
