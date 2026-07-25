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
import { ActionType, type ActionEnvelope } from '../../../../../platform/agentHost/common/state/sessionActions.js';
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
		const fileService = makeFileService();
		const actions = disposables.add(new Emitter<ActionEnvelope>());
		disposables.add(new AgentHostCustomizationRecorder(
			baseDir,
			() => true,
			fileService,
			new NullLogService(),
			{ onDidAction: actions.event },
			new NullRemoteAgentHostService(),
		));

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
		const fileService = makeFileService();
		const actions = disposables.add(new Emitter<ActionEnvelope>());
		let enabled = false;
		disposables.add(new AgentHostCustomizationRecorder(
			baseDir,
			() => enabled,
			fileService,
			new NullLogService(),
			{ onDidAction: actions.event },
			new NullRemoteAgentHostService(),
		));

		actions.fire({ channel: 'copilotcli:/gated', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 1, origin: undefined } as unknown as ActionEnvelope);
		await timeout(2);
		assert.strictEqual(await readAgentHostCustomizationsSnapshot(fileService, buildAgentHostCustomizationsUri(baseDir, 'gated')), undefined);

		// Once enabled, a subsequent action is captured.
		enabled = true;
		actions.fire({ channel: 'copilotcli:/gated', action: { type: ActionType.SessionCustomizationsChanged, customizations: skills }, serverSeq: 2, origin: undefined } as unknown as ActionEnvelope);
		assert.deepStrictEqual(await waitForSnapshot(fileService, 'gated'), skills);
	});
});
