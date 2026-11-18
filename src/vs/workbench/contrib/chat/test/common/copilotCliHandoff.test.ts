/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { FileOperation } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { COPILOT_CLI_HANDOFF_NONE, CopilotCliHandoffState, getCopilotCliHandoffRequestUri, getCopilotCliOwnerRecordUri, getNextCopilotCliHandoffState, ICopilotCliOwnerRecord, observeCopilotCliHandoffInputPaused, parseCopilotCliHandoffRequest, parseCopilotCliOwnerRecord, parseCopilotCliTerminalCommand, readCopilotCliHandoffRequest, readCopilotCliOwnerRecord, requestCopilotCliHandoff, setCopilotCliHandoffInputPaused, writeCopilotCliHandoffRequest, writeCopilotCliOwnerRecord } from '../../common/copilotCliHandoff.js';

suite('Copilot CLI handoff prototype', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const copilotHome = URI.file('/home/user/.copilot');
	const sessionId = '0b6f9a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

	function record(surface: ICopilotCliOwnerRecord['surface'], via: ICopilotCliOwnerRecord['via'], since = '2026-11-17T22:14:00.000Z'): ICopilotCliOwnerRecord {
		return surface === 'cli'
			? { version: 1, surface, app: 'Copilot CLI', folder: '/home/user/tally', since, via }
			: { version: 1, surface, app: 'Code - OSS', uriScheme: 'code-oss', folder: '/home/user/tally', pid: 4242, since, via };
	}

	test('parses version 1 owner records and treats anything else as no recorded owner', () => {
		const vscode = record('vscode', 'code-command');
		assert.deepStrictEqual([
			JSON.stringify(vscode),
			JSON.stringify(record('cli', 'take-back')),
			JSON.stringify({ ...record('cli', 'continue-in-terminal'), pid: 1.5, extra: true }),
			JSON.stringify({ version: 1, surface: 'cli', since: '2026-11-17T22:14:00.000Z', via: 'take-back' }),
			JSON.stringify({ ...vscode, window: 'agents' }),
			JSON.stringify({ ...record('cli', 'continue-in-terminal'), window: 'editor' }),
			JSON.stringify({ ...vscode, window: 'browser' }),
			JSON.stringify({ ...vscode, version: 2 }),
			JSON.stringify({ ...vscode, surface: 'browser' }),
			JSON.stringify({ ...vscode, via: 'link' }),
			JSON.stringify({ ...vscode, since: 'yesterday' }),
			'[]',
			'{"version": 1,',
			'',
		].map(parseCopilotCliOwnerRecord), [
			vscode,
			record('cli', 'take-back'),
			record('cli', 'continue-in-terminal'),
			{ version: 1, surface: 'cli', app: '', folder: '', since: '2026-11-17T22:14:00.000Z', via: 'take-back' },
			{ ...vscode, window: 'agents' },
			{ ...record('cli', 'continue-in-terminal'), window: 'editor' },
			vscode,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	test('writes the owner record atomically, through a temporary file renamed over it', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const ownerRecord = getCopilotCliOwnerRecordUri(copilotHome, sessionId);
		await fileService.writeFile(ownerRecord, VSBuffer.fromString(JSON.stringify(record('vscode', 'code-command'))));
		const moves: string[] = [];
		store.add(fileService.onDidRunOperation(e => {
			if (e.isOperation(FileOperation.MOVE)) {
				moves.push(`${basename(e.resource).replace(/[0-9a-f-]{36}/, '<uuid>')} -> ${basename(e.target.resource)}`);
			}
		}));

		await writeCopilotCliOwnerRecord(fileService, copilotHome, sessionId, { ...record('cli', 'continue-in-terminal'), window: 'agents' });

		const folder = await fileService.resolve(joinPath(copilotHome, 'session-state', sessionId));
		assert.deepStrictEqual({
			record: await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId),
			moves,
			files: folder.children?.map(child => child.name),
		}, {
			record: { ...record('cli', 'continue-in-terminal'), window: 'agents' },
			moves: ['.owner.json.<uuid>.tmp -> owner.json'],
			files: ['owner.json'],
		});
	});

	test('a missing owner record reads as no recorded owner', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		assert.strictEqual(await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId), undefined);
	});

	for (const accepted of [true, false]) {
		test(`a takeover requester never writes ownership before the current owner responds (accepted=${accepted})`, async () => {
			const fileService = store.add(new FileService(new NullLogService()));
			store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
			const original = record('cli', 'take-back');
			const target = record('vscode', 'take-back', '2026-11-17T22:15:00.000Z');
			await writeCopilotCliOwnerRecord(fileService, copilotHome, sessionId, original);
			const written = new DeferredPromise<void>();
			store.add(fileService.onDidRunOperation(event => {
				if (event.isOperation(FileOperation.MOVE) && basename(event.target.resource) === 'handoff.json') {
					written.complete();
				}
			}));
			const result = requestCopilotCliHandoff(fileService, copilotHome, sessionId, target);
			await written.p;
			const beforeReply = await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId);
			const request = (await readCopilotCliHandoffRequest(fileService, copilotHome, sessionId))!;
			if (accepted) {
				await writeCopilotCliOwnerRecord(fileService, copilotHome, sessionId, target);
			}
			await writeCopilotCliHandoffRequest(fileService, copilotHome, sessionId, { ...request, status: accepted ? 'accepted' : 'rejected', ...(accepted ? {} : { reason: 'busy' }) });
			assert.deepStrictEqual({ beforeReply, result: await result, owner: await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId) }, {
				beforeReply: original,
				result: accepted ? undefined : 'busy',
				owner: accepted ? target : original,
			});
		});
	}

	test('an unresponsive current owner cannot be forcefully taken over after the request expires', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 500 }, async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const original = record('cli', 'take-back');
		await writeCopilotCliOwnerRecord(fileService, copilotHome, sessionId, original);
		const result = await requestCopilotCliHandoff(fileService, copilotHome, sessionId, record('vscode', 'take-back'));
		assert.deepStrictEqual({ result, owner: await readCopilotCliOwnerRecord(fileService, copilotHome, sessionId) }, { result: 'expired', owner: original });
	}));

	test('malformed handoff requests fail closed instead of being treated as an idle owner', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(getCopilotCliHandoffRequestUri(copilotHome, sessionId), VSBuffer.fromString('{"status":"accepted"}'));
		assert.strictEqual(parseCopilotCliHandoffRequest('{"status":"accepted"}'), undefined);
		await assert.rejects(() => readCopilotCliHandoffRequest(fileService, copilotHome, sessionId), /could not be read/);
	});

	test('only a record that gives the session to the CLI pauses the chat', () => {
		const since = '2026-11-17T22:14:00.000Z';
		const later = '2026-11-17T22:30:00.000Z';
		const cases: [string, CopilotCliHandoffState, ICopilotCliOwnerRecord | undefined][] = [
			['no record keeps what this window knows', { kind: 'continuedInTerminal', since }, undefined],
			['VS Code owning it keeps the chat as it is', COPILOT_CLI_HANDOFF_NONE, record('vscode', 'code-command')],
			['VS Code taking it back waits for the import', { kind: 'takenByCli', since }, record('vscode', 'take-back', later)],
			['Continue in Terminal from another window', COPILOT_CLI_HANDOFF_NONE, record('cli', 'continue-in-terminal')],
			['Continue in Terminal from this window', { kind: 'continuedInTerminal', since }, record('cli', 'continue-in-terminal')],
			['the CLI takes it back', COPILOT_CLI_HANDOFF_NONE, record('cli', 'take-back')],
			['the CLI takes it back after Continue in Terminal', { kind: 'continuedInTerminal', since }, record('cli', 'take-back', later)],
			['View Only stays for the same take-back', { kind: 'viewOnly', since }, record('cli', 'take-back')],
			['a later take-back shows the banner again', { kind: 'viewOnly', since }, record('cli', 'take-back', later)],
		];
		assert.deepStrictEqual(Object.fromEntries(cases.map(([name, current, ownerRecord]) => [name, getNextCopilotCliHandoffState(current, ownerRecord)])), {
			'no record keeps what this window knows': { kind: 'continuedInTerminal', since },
			'VS Code owning it keeps the chat as it is': COPILOT_CLI_HANDOFF_NONE,
			'VS Code taking it back waits for the import': { kind: 'takenByCli', since },
			'Continue in Terminal from another window': { kind: 'continuedInTerminal', since },
			'Continue in Terminal from this window': { kind: 'continuedInTerminal', since },
			'the CLI takes it back': { kind: 'takenByCli', since },
			'the CLI takes it back after Continue in Terminal': { kind: 'takenByCli', since: later },
			'View Only stays for the same take-back': { kind: 'viewOnly', since },
			'a later take-back shows the banner again': { kind: 'takenByCli', since: later },
		});
	});

	test('splits the terminal command into leading environment assignments and the command', () => {
		assert.deepStrictEqual([
			'copilot',
			'COPILOT_HANDOFF_PROTOTYPE=1 ~/.local/bin/copilot-dev',
			`EXAMPLE_ARGUMENTS='["/tmp/example.sh"]' "/Users/me/demo task/run.sh" --example`,
			'/Users/me/demo\\ task/run.sh "~/not-home"',
			'A=1 B=2',
			'  ',
			'COPILOT_GITHUB_TOKEN="$(gh auth token)" copilot',
			`A='$(literal)' \\$B copilot "\\$C"`,
			'copilot; echo done',
		].map(commandLine => parseCopilotCliTerminalCommand(commandLine, '/Users/me')), [
			{ environment: [], command: ['copilot'], needsShell: false },
			{ environment: ['COPILOT_HANDOFF_PROTOTYPE=1'], command: ['/Users/me/.local/bin/copilot-dev'], needsShell: false },
			{ environment: ['EXAMPLE_ARGUMENTS=["/tmp/example.sh"]'], command: ['/Users/me/demo task/run.sh', '--example'], needsShell: false },
			{ environment: [], command: ['/Users/me/demo task/run.sh', '~/not-home'], needsShell: false },
			{ environment: ['A=1', 'B=2'], command: [], needsShell: false },
			{ environment: [], command: [], needsShell: false },
			{ environment: ['COPILOT_GITHUB_TOKEN=$(gh auth token)'], command: ['copilot'], needsShell: true },
			{ environment: ['A=$(literal)'], command: ['$B', 'copilot', '$C'], needsShell: false },
			{ environment: [], command: ['copilot;', 'echo', 'done'], needsShell: true },
		]);
	});

	test('pausing input applies to every chat of the session', () => {
		const session = URI.from({ scheme: 'agent-host-copilotcli', path: `/${sessionId}` });
		const defaultChat = observeCopilotCliHandoffInputPaused(session);
		const peerChat = observeCopilotCliHandoffInputPaused(session.with({ fragment: 'peer' }));
		const otherSession = observeCopilotCliHandoffInputPaused(session.with({ path: '/other' }));
		try {
			setCopilotCliHandoffInputPaused(session.with({ fragment: 'peer' }), true);
			assert.deepStrictEqual([defaultChat.get(), peerChat.get(), otherSession.get()], [true, true, false]);
		} finally {
			setCopilotCliHandoffInputPaused(session, false);
		}
		assert.deepStrictEqual([defaultChat.get(), peerChat.get()], [false, false]);
	});
});
