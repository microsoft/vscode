/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { CopyLinkToRequestAction, requestMyRequestMatches } from '../../browser/myRequests/myRequests.js';
import { maxRecordedRequests, MyRequestsStore } from '../../browser/myRequests/myRequestsStore.js';

suite('Search My Requests', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let store: MyRequestsStore;
	setup(() => { store = new MyRequestsStore(generateUuid()); });
	teardown(async () => {
		await store.setRecording(false);
		await store.clear();
	});

	const link = (authority: string, turn = 'one') => `agent-host-session://mock/session?connectionAuthority=${authority}&chat=peer&turn=${turn}`;

	test('copies the clicked peer turn with no recording or history service', async () => {
		const services = disposables.add(new TestInstantiationService());
		const written: string[] = [];
		services.stub(IClipboardService, { writeText: async text => { written.push(text); } });
		services.stub(IAgentHostConnectionsService, { resolveSessionResourceIdentity: () => ({ connectionAuthority: 'b', backendSession: URI.parse('mock:/session') }) });
		services.stub(IAgentHostUntitledProvisionalSessionService, {});
		services.stub(IWorkbenchEnvironmentService, {});
		await new CopyLinkToRequestAction().run(services, { message: {}, id: 'one', sessionResource: URI.parse('remote-b-mock:/session#peer') });
		assert.deepStrictEqual([written, await store.search()], [[link('b')], []]);
	});

	test('concurrent windows retain both hosts, restart reads offline, clear invalidates in-flight records', async () => {
		const otherWindow = new MyRequestsStore(store.profileId);
		assert.strictEqual(await store.recording(), undefined);
		await store.setRecording(true);
		const epoch = await otherWindow.recording();
		assert.ok(epoch);
		await Promise.all([
			store.record(epoch, 'cache invalidation\non A', link('a')),
			otherWindow.record(epoch, 'review this', link('b')),
		]);
		await store.record(epoch, 'a retried or expanded message', link('b'));
		const restarted = new MyRequestsStore(store.profileId);
		assert.deepStrictEqual(await restarted.search('INVALIDATION cache'), [{ text: 'cache invalidation\non A', link: link('a') }]);
		assert.deepStrictEqual(await new MyRequestsStore(generateUuid()).search(), []);
		await restarted.forget({ text: 'cache invalidation\non A', link: link('a') });
		assert.deepStrictEqual(await otherWindow.search(), [{ text: 'review this', link: link('b') }]);
		await otherWindow.clear();
		await store.record(epoch, 'stale', link('a'));
		assert.deepStrictEqual(await store.search(), []);
	});

	test('retains the most recent submissions and stopping does not erase existing requests', async () => {
		await store.setRecording(true);
		const epoch = await store.recording();
		assert.ok(epoch);
		for (let i = 0; i <= maxRecordedRequests; i++) {
			await store.record(epoch, `submission ${i}`, link('a', String(i)));
		}
		await store.setRecording(false);
		await store.record(epoch, 'after stop', link('b'));
		const saved = await store.search();
		assert.deepStrictEqual([saved.length, saved[0].text, saved.at(-1)?.text], [maxRecordedRequests, `submission ${maxRecordedRequests}`, 'submission 1']);
	});

	test('caller receives nothing on dismissal, and only the reviewed text and link on confirmation', async () => {
		await store.setRecording(true);
		const epoch = await store.recording();
		assert.ok(epoch);
		await store.record(epoch, 'cache private other match', link('a'));
		await store.record(epoch, 'cache chosen match', link('b'));
		const services = disposables.add(new TestInstantiationService());
		services.stub(IUserDataProfileService, { currentProfile: upcastPartial<IUserDataProfile>({ id: store.profileId }) });
		services.stub(IChatEntitlementService, { sentiment: { hidden: false } });
		let choose = false;
		let confirm = false;
		let forget = false;
		services.stub(IQuickInputService, {}, 'pick', async (picks: IQuickPickItem[]) => choose ? picks[0] : undefined);
		services.stub(IDialogService, { confirm: async () => {
			if (forget) {
				await store.forget({ text: 'cache chosen match', link: link('b') });
			}
			return { confirmed: confirm };
		} });
		const run = () => services.invokeFunction(requestMyRequestMatches, 'cache');
		assert.deepStrictEqual(await run(), []);
		choose = true;
		assert.deepStrictEqual(await run(), []);
		confirm = true;
		assert.deepStrictEqual(await run(), [{ text: 'cache chosen match', link: link('b') }]);
		forget = true;
		assert.deepStrictEqual(await run(), []);
	});
});
