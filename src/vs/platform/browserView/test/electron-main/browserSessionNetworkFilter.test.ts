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

	test('filters only explicitly shared webContents in a shared Electron session', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);

		assert.deepStrictEqual({
			sharedDenied: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 }),
			unsharedDenied: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 2 }),
			missingOwnerDenied: invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame' }),
			sharedAllowed: invokeRequest(filter, { url: 'https://allowed.example/frame', resourceType: 'subFrame', webContentsId: 1 }),
			sharedPolicyError: filter.getPolicyError(1),
			unsharedPolicyError: filter.getPolicyError(2),
		}, {
			sharedDenied: { cancel: true },
			unsharedDenied: { cancel: false },
			missingOwnerDenied: { cancel: false },
			sharedAllowed: { cancel: false },
			sharedPolicyError: 'Access to denied.example is blocked by network domain policy.',
			unsharedPolicyError: undefined,
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

	test('main-frame navigation remains loadable and resets retained subframe errors', () => {
		const { filter } = createFilter();
		filter.setFiltering(1, true);
		invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });

		const result = invokeRequest(filter, { url: 'https://denied.example/page', resourceType: 'mainFrame', webContentsId: 1 });

		assert.deepStrictEqual({
			result,
			policyError: filter.getPolicyError(1),
		}, {
			result: { cancel: false },
			policyError: undefined,
		});
	});

	test('uses the webContents object when webContentsId is omitted', () => {
		const { filter } = createFilter();
		const webContents = { id: 1 } as unknown as Electron.WebContents;
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
			mainFrame: { cancel: false },
			policyErrorAfterNavigation: undefined,
		});
	});

	test('uses current network policy for every request', () => {
		const { filter, setDeniedAuthority } = createFilter();
		filter.setFiltering(1, true);

		const initiallyDenied = invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });
		setDeniedAuthority(undefined);
		const allowedAfterPolicyChange = invokeRequest(filter, { url: 'https://denied.example/frame', resourceType: 'subFrame', webContentsId: 1 });

		assert.deepStrictEqual({ initiallyDenied, allowedAfterPolicyChange }, {
			initiallyDenied: { cancel: true },
			allowedAfterPolicyChange: { cancel: false },
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
