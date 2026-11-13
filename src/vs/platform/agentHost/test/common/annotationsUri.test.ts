/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildAnnotationsUri, isAhpAnnotationsChannel, isAnnotationsUri, parseAnnotationsUri } from '../../common/annotationsUri.js';

suite('annotationsUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('canonical session annotations retain their identity on a dedicated scheme', () => {
		const session = 'ahp-session:/session-id/subagent/tool-call';
		const resource = buildAnnotationsUri(session);
		assert.deepStrictEqual({ resource, owner: parseAnnotationsUri(resource), recognized: isAnnotationsUri(resource) }, {
			resource: 'ahp-annotations:/session-id/subagent/tool-call',
			owner: { sessionUri: session },
			recognized: true,
		});
	});

	test('retained provider identities round-trip exactly without sharing an annotations channel', () => {
		const sessions = [
			'copilotcli:/same-id',
			'claude:/same-id',
			'codex:/same-id',
			'copilotcli:/same-id#subagent/tool-call',
			'provider://tenant/escaped%20session?scope=one#selection',
		];
		const channels = sessions.map(buildAnnotationsUri);
		assert.deepStrictEqual({
			schemes: channels.map(channel => URI.parse(channel).scheme),
			distinct: new Set(channels).size,
			owners: channels.map(channel => parseAnnotationsUri(channel)?.sessionUri),
		}, {
			schemes: sessions.map(() => 'ahp-annotations'),
			distinct: sessions.length,
			owners: sessions,
		});
	});

	test('recognizes previously advertised suffixes without minting new ones', () => {
		const sessions = ['ahp-session:/saved', 'copilotcli:/saved', 'claude:/saved'];
		assert.deepStrictEqual(sessions.map(session => {
			const previous = `${session}/annotations`;
			return { previousOwner: parseAnnotationsUri(previous), recognized: isAnnotationsUri(previous), dedicated: isAhpAnnotationsChannel(previous), newScheme: URI.parse(buildAnnotationsUri(session)).scheme };
		}), sessions.map(session => ({ previousOwner: { sessionUri: session }, recognized: true, dedicated: false, newScheme: 'ahp-annotations' })));
	});

	test('recognizes arbitrary remote annotation channels without guessing their local owner', () => {
		const remote = 'ahp-annotations://another-host/reviews?scope=one#selection';
		const invalidLocal = [
			'ahp-annotations://vscode-legacy/',
			'ahp-annotations://vscode-legacy/not-base64!',
			'ahp-annotations://vscode-legacy/YWJj',
			'ahp-annotations://vscode-legacy/YWJj/extra',
			'ahp-annotations:/',
			'not a URI',
		];
		assert.deepStrictEqual({
			recognized: isAnnotationsUri(remote),
			remoteOwner: parseAnnotationsUri(remote),
			invalidOwners: invalidLocal.map(parseAnnotationsUri),
			sessionRecognized: isAnnotationsUri('ahp-session:/session-id'),
		}, {
			recognized: true,
			remoteOwner: undefined,
			invalidOwners: invalidLocal.map(() => undefined),
			sessionRecognized: false,
		});
	});
});
