/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { FormattingOptions } from '../../../../../base/common/jsonFormatter.js';
import { IChannel, IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { IUserDataSyncUtilService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncUtilChannelContribution } from '../../electron-browser/userDataSyncUtilChannel.contribution.js';

class TestUserDataSyncUtilService implements IUserDataSyncUtilService {

	declare readonly _serviceBrand: undefined;

	async resolveUserBindings(): Promise<IStringDictionary<string>> {
		return {};
	}

	async resolveFormattingOptions(): Promise<FormattingOptions> {
		return { eol: '\n', insertSpaces: true, tabSize: 4 };
	}

	async resolveDefaultCoreIgnoredSettings(): Promise<string[]> {
		return ['editor.fontSize'];
	}
}

class RecordingSharedProcessService implements ISharedProcessService {

	declare readonly _serviceBrand: undefined;

	private channelRegistration: { channelName: string; channel: IServerChannel<string> } | undefined;

	get registration(): { channelName: string; channel: IServerChannel<string> } {
		if (!this.channelRegistration) {
			throw new Error('No channel was registered');
		}

		return this.channelRegistration;
	}

	getChannel(): IChannel {
		throw new Error('Not implemented');
	}

	registerChannel(channelName: string, channel: IServerChannel<string>): void {
		this.channelRegistration = { channelName, channel };
	}

	createRawConnection(): Promise<MessagePort> {
		throw new Error('Not implemented');
	}

	notifyRestored(): void { }
}

suite('UserDataSyncUtilChannelContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the user data sync utility channel', async () => {
		const sharedProcessService = new RecordingSharedProcessService();
		disposables.add(new UserDataSyncUtilChannelContribution(new TestUserDataSyncUtilService(), sharedProcessService));

		const registration = sharedProcessService.registration;
		const value = await registration.channel.call<string[]>('window:1', 'resolveDefaultCoreIgnoredSettings');

		assert.deepStrictEqual({ channelName: registration.channelName, value }, {
			channelName: 'userDataSyncUtil',
			value: ['editor.fontSize']
		});
	});
});
