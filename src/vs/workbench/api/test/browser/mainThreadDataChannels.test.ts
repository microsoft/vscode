/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type * as vscode from 'vscode';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentSessionLinkPresentation } from '../../../../platform/agentHost/common/openSessionLink.js';
import { DataWatcherKind } from '../../../../platform/dataChannel/common/dataChannel.js';
import { DataChannelService, DataWatcherService } from '../../../services/dataChannel/browser/dataChannelService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadDataChannels } from '../../browser/mainThreadDataChannels.js';
import { ExtHostDataChannels } from '../../common/extHostDataChannels.js';
import { ExtHostDataChannelsShape } from '../../common/extHost.protocol.js';
import { AgentSessionStatus } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadDataChannels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('bridges observable watcher data and disposes the subscription', () => {
		const data = observableValue<IAgentSessionLinkPresentation | undefined>('data', undefined);
		const dataWatcherService = new DataWatcherService();
		store.add(dataWatcherService.registerDataWatcherProvider(DataWatcherKind.AgentSession, {
			createDataWatcher: () => ({
				data,
				dispose: () => { },
			}),
		}));
		const extHostProxy: ExtHostDataChannelsShape = {
			$onDidReceiveData: (channelId, value) => extHost.$onDidReceiveData(channelId, value),
			$acceptDataWatcherData: (handle, value) => extHost.$acceptDataWatcherData(handle, value),
		};
		const mainThread = store.add(new MainThreadDataChannels(
			SingleProxyRPCProtocol(extHostProxy),
			store.add(new DataChannelService()),
			dataWatcherService,
		));
		const extHost = new ExtHostDataChannels(SingleProxyRPCProtocol(mainThread));
		const extension = {
			...nullExtensionDescription,
			enabledApiProposals: ['dataChannels'],
		};
		const watcher = store.add(extHost.createDataWatcher(extension, {
			kind: 0,
			resource: URI.parse('agent-host-session://copilotcli/session'),
		}));
		const values: (vscode.AgentSessionData | undefined)[] = [watcher.data];
		store.add(watcher.onDidChange(() => values.push(watcher.data)));

		data.set({ title: 'Running session', status: 'inProgress' }, undefined);
		data.set({ title: 'Running session', status: 'needsInput' }, undefined);
		watcher.dispose();
		data.set({ title: 'Completed session', status: 'completed' }, undefined);

		assert.deepStrictEqual(values, [
			undefined,
			{ title: 'Running session', status: AgentSessionStatus.InProgress },
			{ title: 'Running session', status: AgentSessionStatus.NeedsInput },
		]);
	});
});
