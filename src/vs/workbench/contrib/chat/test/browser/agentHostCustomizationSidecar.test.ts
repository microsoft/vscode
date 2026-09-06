/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ActionType, NotificationType, type ActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { CustomizationType, type Customization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostCustomizationRecorder, buildAgentHostCustomizationsUri, readAgentHostCustomizationsSnapshot } from '../../browser/chatDebug/agentHostUsageSidecar.js';

suite('AgentHostCustomizationRecorder', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const baseDir = URI.file('/user');

	function makeFileService(): FileService {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		return fileService;
	}

	const skills = [
		{ type: CustomizationType.Skill, id: 'sk1', uri: 'file:///ws/.github/skills/troubleshoot/SKILL.md', name: 'troubleshoot', enabled: true },
		{ type: CustomizationType.Hook, id: 'hk1', uri: 'file:///ws/.github/hooks/lint.json', name: 'lint-on-save', enabled: true },
	] as unknown as Customization[];

	/** Polls the sidecar until the snapshot appears (the recorder writes async). */
	async function waitForSnapshot(fileService: FileService, rawId: string): Promise<Customization[] | undefined> {
		const uri = buildAgentHostCustomizationsUri(baseDir, rawId);
		for (let i = 0; i < 100; i++) {
			const snapshot = await readAgentHostCustomizationsSnapshot(fileService, uri);
			if (snapshot !== undefined) {
				return snapshot;
			}
			await timeout(0);
		}
		return undefined;
	}

	/** Builds a recorder wired to fresh emitters and an in-memory file service. */
	function makeRecorder(isEnabled: () => boolean = () => true) {
		const fileService = makeFileService();
		const actions = disposables.add(new Emitter<ActionEnvelope>());
		const notifications = disposables.add(new Emitter<INotification>());
		disposables.add(new AgentHostCustomizationRecorder(
			baseDir,
			isEnabled,
			fileService,
			new NullLogService(),
			{ onDidAction: actions.event, onDidNotification: notifications.event },
			new NullRemoteAgentHostService(),
		));
		return { fileService, actions, notifications };
	}

	test('round-trips a snapshot; missing and malformed files read as undefined', async () => {
		const fileService = makeFileService();
		const uri = buildAgentHostCustomizationsUri(baseDir, 'abc');

		// Missing file → undefined.
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, uri), undefined);

		// Written array round-trips exactly.
		await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(skills)));
		assert.deepStrictEqual(await readAgentHostCustomizationsSnapshot(fileService, uri), skills);

		// Malformed content → undefined (rather than throwing).
		await fileService.writeFile(uri, VSBuffer.fromString('{ not json'));
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, uri), undefined);
	});

	test('writes the snapshot for a Copilot CLI session channel and ignores other channels/actions', async () => {
		const { fileService, actions } = makeRecorder();

		// Ignored: a non-customization action, and a customization action on a
		// non-Copilot-CLI channel — neither should produce a sidecar file.
		actions.fire({ channel: 'copilotcli:/wrongtype', action: { type: ActionType.ChatUsage, turnId: '0', usage: {} }, serverSeq: 1, origin: undefined } as unknown as ActionEnvelope);
		actions.fire({ channel: 'ahp-root://', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 2, origin: undefined } as unknown as ActionEnvelope);

		// Captured: a full-replacement customizations change on the session's
		// `copilotcli:/<rawId>` channel is persisted under that raw id.
		actions.fire({ channel: 'copilotcli:/good', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 3, origin: undefined } as unknown as ActionEnvelope);

		assert.deepStrictEqual(await waitForSnapshot(fileService, 'good'), skills);
		// The ignored actions left no sidecar behind.
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, buildAgentHostCustomizationsUri(baseDir, 'wrongtype')), undefined);
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, buildAgentHostCustomizationsUri(baseDir, '')), undefined);
	});

	test('does not capture while disabled', async () => {
		let enabled = false;
		const { fileService, actions } = makeRecorder(() => enabled);

		actions.fire({ channel: 'copilotcli:/gated', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 1, origin: undefined } as unknown as ActionEnvelope);
		await timeout(2);
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, buildAgentHostCustomizationsUri(baseDir, 'gated')), undefined);

		// Once enabled, a subsequent action is captured.
		enabled = true;
		actions.fire({ channel: 'copilotcli:/gated', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 2, origin: undefined } as unknown as ActionEnvelope);
		assert.deepStrictEqual(await waitForSnapshot(fileService, 'gated'), skills);
	});

	test('deletes the sidecar when its session is removed, even after capture is disabled', async () => {
		// The host's own per-session storage cascades away with the session
		// directory; without this the client-side copies would outlive every
		// deleted session and grow without bound.
		let enabled = true;
		const { fileService, actions, notifications } = makeRecorder(() => enabled);

		actions.fire({ channel: 'copilotcli:/doomed', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 1, origin: undefined } as unknown as ActionEnvelope);
		assert.deepStrictEqual(await waitForSnapshot(fileService, 'doomed'), skills);

		// Turning capture off must not strand the file already written.
		enabled = false;
		notifications.fire({ type: NotificationType.SessionRemoved, channel: 'ahp-root://', session: 'copilotcli:/doomed' } as unknown as INotification);

		const uri = buildAgentHostCustomizationsUri(baseDir, 'doomed');
		for (let i = 0; i < 100 && await fileService.exists(uri); i++) {
			await timeout(0);
		}
		assert.strictEqual(await fileService.exists(uri), false);
	});

	test('ignores unrelated notifications and sessions with no sidecar', async () => {
		const { fileService, actions, notifications } = makeRecorder();

		actions.fire({ channel: 'copilotcli:/keep', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 1, origin: undefined } as unknown as ActionEnvelope);
		assert.deepStrictEqual(await waitForSnapshot(fileService, 'keep'), skills);

		// A different session's removal, a non-CLI session, and a removal for a
		// session that never had a sidecar must all leave `keep` untouched and
		// must not throw.
		notifications.fire({ type: NotificationType.SessionRemoved, channel: 'ahp-root://', session: 'copilotcli:/never-recorded' } as unknown as INotification);
		notifications.fire({ type: NotificationType.SessionRemoved, channel: 'ahp-root://', session: 'claude:/other' } as unknown as INotification);
		notifications.fire({ type: NotificationType.SessionAdded, channel: 'ahp-root://', session: 'copilotcli:/keep' } as unknown as INotification);
		await timeout(2);

		assert.deepStrictEqual(await readAgentHostCustomizationsSnapshot(fileService, buildAgentHostCustomizationsUri(baseDir, 'keep')), skills);
	});
});
