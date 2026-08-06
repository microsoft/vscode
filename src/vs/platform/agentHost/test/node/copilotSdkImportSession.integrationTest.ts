/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, approveAll, type CopilotSession, type SessionEvent } from '@github/copilot-sdk';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { MessageKind, ResponsePartKind, TurnState, type ResponsePart, type Turn } from '../../common/state/sessionState.js';
import { buildSessionEventLogFromTurns } from '../../node/copilot/buildSessionEvents.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';

suite('Copilot SDK - imported sessions', function () {

	this.timeout(120_000);

	let client: CopilotClient;
	let root: string;
	let workDirectory: string;

	suiteSetup(async function () {
		root = await mkdtemp(join(tmpdir(), 'ahp-import-'));
		workDirectory = join(root, 'work');
		await mkdir(workDirectory);
		client = new CopilotClient({
			mode: 'empty',
			baseDirectory: root,
			useLoggedInUser: false,
			logLevel: 'error',
			env: createCopilotCliEnvironment(),
		});
		await client.start();
	});

	suiteTeardown(async function () {
		try {
			await client?.stop();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('bundled SDK resumes synthesized events as editable turns', async function () {
		const sessionId = generateUuid();
		const turns: Turn[] = [
			userTurn(generateUuid(), 'What is 2+2?', 'It is 4.'),
			userTurn(generateUuid(), 'And 3+3?', 'It is 6.'),
		];
		const sessionDirectory = join(root, 'session-state', sessionId);
		await mkdir(sessionDirectory, { recursive: true });
		await writeFile(
			join(sessionDirectory, 'events.jsonl'),
			buildSessionEventLogFromTurns(turns, { sessionId, workingDirectory: workDirectory }),
			'utf8',
		);

		let session: CopilotSession | undefined;
		try {
			session = await client.resumeSession(sessionId, {
				availableTools: [],
				onPermissionRequest: approveAll,
				workingDirectory: workDirectory,
			});
			const events: SessionEvent[] = await session.getEvents();
			const firstUser = events.find(event => event.type === 'user.message');
			assert.ok(firstUser);
			const truncate = await session.rpc.history.truncate({ eventId: firstUser.id });

			assert.deepStrictEqual({
				userMessages: events.filter(event => event.type === 'user.message').map(event => event.data.content),
				eventsRemoved: truncate.eventsRemoved > 0,
			}, {
				userMessages: ['What is 2+2?', 'And 3+3?'],
				eventsRemoved: true,
			});
		} finally {
			await session?.disconnect();
		}
	});
});

function userTurn(id: string, text: string, response: string): Turn {
	const responseParts: ResponsePart[] = response
		? [{ kind: ResponsePartKind.Markdown, id: generateUuid(), content: response }]
		: [];
	return {
		id,
		message: { text, origin: { kind: MessageKind.User } },
		responseParts,
		usage: undefined,
		state: TurnState.Complete,
	};
}
