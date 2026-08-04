/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { BrowserViewModel, BrowserViewSharingState } from '../../common/browserView.js';

suite('BrowserViewModel sharing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	function createModel(allowed = true): {
		model: BrowserViewModel;
		startTrackingPage: sinon.SinonStub;
		stopTrackingPage: sinon.SinonStub;
		sharingEvents: BrowserViewSharingState[];
	} {
		const startTrackingPage = sinon.stub().resolves();
		const stopTrackingPage = sinon.stub().resolves();
		const sharingEvents: BrowserViewSharingState[] = [];
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isUriAllowed: (_uri: URI) => allowed,
			formatError: uri => `Access to ${uri.authority} is blocked by network domain policy.`,
		};
		const model = Object.create(BrowserViewModel.prototype) as BrowserViewModel;
		Reflect.set(model, 'id', 'view');
		Reflect.set(model, '_url', 'https://example.com');
		Reflect.set(model, '_sharedWithAgent', false);
		Reflect.set(model, 'agentNetworkFilterService', networkFilter);
		Reflect.set(model, 'storageService', { getBoolean: () => true });
		Reflect.set(model, 'telemetryService', { publicLog2: () => { } });
		Reflect.set(model, 'playwrightService', { startTrackingPage, stopTrackingPage });
		Reflect.set(model, 'browserViewWorkbenchService', { isSharingAvailable: true });
		Reflect.set(model, '_onDidChangeSharingState', { fire: (state: BrowserViewSharingState) => sharingEvents.push(state) });
		return { model, startTrackingPage, stopTrackingPage, sharingEvents };
	}

	test('sharing starts agent tracking and unsharing stops it', async () => {
		const { model, startTrackingPage, stopTrackingPage, sharingEvents } = createModel();

		const shared = await model.setSharedWithAgent(true);
		const sharedState = model.sharingState;
		const unshared = await model.setSharedWithAgent(false);

		assert.deepStrictEqual({
			shared,
			unshared,
			startTrackingArgs: startTrackingPage.args,
			stopTrackingArgs: stopTrackingPage.args,
			sharedState,
			finalState: model.sharingState,
			sharingEvents,
		}, {
			shared: true,
			unshared: true,
			startTrackingArgs: [['view']],
			stopTrackingArgs: [['view']],
			sharedState: BrowserViewSharingState.Shared,
			finalState: BrowserViewSharingState.NotShared,
			sharingEvents: [BrowserViewSharingState.Shared, BrowserViewSharingState.NotShared],
		});
	});

	test('does not share a page whose current URL is denied', async () => {
		const { model, startTrackingPage, sharingEvents } = createModel(false);
		const info = sinon.stub().resolves();
		Reflect.set(model, 'dialogService', { info });

		const shared = await model.setSharedWithAgent(true);

		assert.deepStrictEqual({
			shared,
			startTrackingCallCount: startTrackingPage.callCount,
			infoCallCount: info.callCount,
			sharingState: model.sharingState,
			sharingEvents,
		}, {
			shared: false,
			startTrackingCallCount: 0,
			infoCallCount: 1,
			sharingState: BrowserViewSharingState.NotShared,
			sharingEvents: [],
		});
	});
});
