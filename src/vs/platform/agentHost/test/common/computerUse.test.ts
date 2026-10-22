/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { COMPUTER_USE_ACTIVATION_META_KEY, COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH, COMPUTER_USE_SETUP_META_KEY, COMPUTER_USE_STATUS_KEY, isComputerUseRequest } from '../../common/computerUse.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose, withChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { getComputerUseActivationAnswers, isComputerUseActivationAccepted, readComputerUseActivationCard, readComputerUseSetupCard, readComputerUseStatus, readComputerUseStatusFromRootState, withComputerUseActivationCard, withComputerUseSetupCard } from '../../common/meta/computerUse.js';
import { ChatInputResponseKind, type ChatInputRequest, type RootState } from '../../common/state/sessionState.js';

suite('Computer Use setup contract', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts only well-formed requests, with the permission each action needs', () => {
		const base = { nonce: 'n', setupId: 's', round: 1 };
		assert.deepStrictEqual([
			{ ...base, action: 'request', permission: 'accessibility' },
			{ ...base, action: 'openSettings', permission: 'screenRecording' },
			{ ...base, action: 'recheck' },
			{ ...base, action: 'request' },
			{ ...base, action: 'recheck', permission: 'accessibility' },
			{ ...base, action: 'request', permission: 'camera' },
			{ ...base, action: 'reset' },
			{ ...base, action: 'recheck', round: -1 },
			{ ...base, action: 'recheck', round: 1.5 },
			{ ...base, action: 'recheck', nonce: '' },
			{ ...base, action: 'recheck', setupId: 'x'.repeat(257) },
			['recheck'],
			undefined,
		].map(isComputerUseRequest), [true, true, true, false, false, false, false, false, false, false, false, false, false]);
	});

	test('reads published status defensively and only from schema version 1', () => {
		const status = readComputerUseStatus({
			schemaVersion: 1,
			permissions: [{ permission: 'screenRecording', state: 'granted' }, { permission: 'accessibility', state: 'bogus' }, { permission: 'camera', state: 'granted' }],
			verifiedAt: 5,
			operation: { setupId: 'a', action: 'request' },
			setups: [
				{ id: 'a', chat: 'chat:a', state: 'needsPermissions', round: 2, actions: [{ action: 'request', permission: 'accessibility' }, { action: 'openSettings' }, { action: 'recheck', permission: 'accessibility' }, { action: 'recheck' }], error: { code: 'stillNotGranted', message: 'Still off' }, extra: true },
				{ id: 'a', chat: 'chat:a', state: 'ready', round: 3, actions: [] },
				{ id: 'b', chat: 'chat:b', state: 'ready', round: 1, actions: [{ action: 'recheck' }], error: { code: '', message: 'dropped' } },
				{ id: 'c', chat: 'chat:c', state: 'unknown', round: 1, actions: [] },
				{ chat: 'chat:d', state: 'ended', round: 1, actions: [] },
			],
		});
		assert.deepStrictEqual({
			status,
			otherVersion: readComputerUseStatus({ schemaVersion: 2, permissions: [], setups: [] }),
			notAnObject: readComputerUseStatus('status'),
			helperApps: [
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app', icon: 'data:image/png;base64,iVBORw0KGgo=' },
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app', icon: 'https://example.com/icon.png' },
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app', icon: 'data:image/png;base64,<svg>' },
				{ path: 'relative/Copilot Computer Use.app' },
				{ path: '/Users/me/.copilot/computer-use/helper' },
				{ path: `/${'x'.repeat(4096)}.app` },
				'/Users/me/.copilot/computer-use/Copilot Computer Use.app',
			].map(helperApp => readComputerUseStatus({ schemaVersion: 1, permissions: [], setups: [], helperApp })?.helperApp),
		}, {
			status: {
				schemaVersion: 1,
				permissions: [{ permission: 'accessibility', state: 'unknown' }, { permission: 'screenRecording', state: 'granted' }],
				verifiedAt: 5,
				setups: [
					{ id: 'a', chat: 'chat:a', state: 'needsPermissions', round: 2, actions: [{ action: 'request', permission: 'accessibility' }, { action: 'recheck' }], error: { code: 'stillNotGranted', message: 'Still off' } },
					{ id: 'b', chat: 'chat:b', state: 'ready', round: 1, actions: [] },
				],
			},
			otherVersion: undefined,
			notAnObject: undefined,
			helperApps: [
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app', icon: 'data:image/png;base64,iVBORw0KGgo=' },
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app' },
				{ path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app' },
				undefined,
				undefined,
				undefined,
				undefined,
			],
		});
	});

	test('reads status from root state only when the host publishes it', () => {
		const rootState = (values: Record<string, unknown>) => ({ config: { schema: { type: 'object', properties: {} }, values } }) as unknown as RootState;
		assert.deepStrictEqual({
			published: readComputerUseStatusFromRootState(rootState({ [COMPUTER_USE_STATUS_KEY]: { schemaVersion: 1, permissions: [], setups: [] } }))?.permissions.map(permission => permission.state),
			absent: readComputerUseStatusFromRootState(rootState({})),
			error: readComputerUseStatusFromRootState(new Error('disconnected')),
		}, {
			published: ['unknown', 'unknown'],
			absent: undefined,
			error: undefined,
		});
	});

	test('marks a chat input request as a setup card, preserving other metadata across the wire', () => {
		const request: ChatInputRequest = { id: 'r', message: 'm', questions: [] };
		const card = withComputerUseSetupCard(withChatInputRequestPurpose(request, ChatInputRequestPurpose.Elicitation), 'setup-1');
		const wire: ChatInputRequest = JSON.parse(JSON.stringify(card));
		assert.deepStrictEqual({
			card: readComputerUseSetupCard(wire),
			purpose: readChatInputRequestPurpose(wire),
			plain: readComputerUseSetupCard(request),
			malformed: readComputerUseSetupCard({ ...request, _meta: { [COMPUTER_USE_SETUP_META_KEY]: { setupId: 7 } } } as ChatInputRequest),
		}, {
			card: { setupId: 'setup-1' },
			purpose: ChatInputRequestPurpose.Elicitation,
			plain: undefined,
			malformed: undefined,
		});
	});

	test('marks a request to turn on Computer Use, and accepts only a submitted Turn On', () => {
		const request: ChatInputRequest = { id: 'r', message: 'm', questions: [] };
		const wire: ChatInputRequest = JSON.parse(JSON.stringify(withComputerUseActivationCard(withChatInputRequestPurpose(request, ChatInputRequestPurpose.Elicitation), { reason: 'Open Calculator' })));
		const turnOn = getComputerUseActivationAnswers('turnOn');
		assert.deepStrictEqual({
			card: readComputerUseActivationCard(wire),
			purpose: readChatInputRequestPurpose(wire),
			withoutReason: readComputerUseActivationCard(withComputerUseActivationCard(request, {})),
			plain: readComputerUseActivationCard(request),
			malformedReason: readComputerUseActivationCard({ ...request, _meta: { [COMPUTER_USE_ACTIVATION_META_KEY]: { reason: 'x'.repeat(COMPUTER_USE_ACTIVATION_REASON_MAX_LENGTH + 1) } } } as ChatInputRequest),
			accepted: {
				turnOn: isComputerUseActivationAccepted(ChatInputResponseKind.Accept, turnOn),
				notNow: isComputerUseActivationAccepted(ChatInputResponseKind.Accept, getComputerUseActivationAnswers('notNow')),
				declined: isComputerUseActivationAccepted(ChatInputResponseKind.Decline, turnOn),
				noAnswer: isComputerUseActivationAccepted(ChatInputResponseKind.Accept, undefined),
			},
		}, {
			card: { reason: 'Open Calculator' },
			purpose: ChatInputRequestPurpose.Elicitation,
			withoutReason: {},
			plain: undefined,
			malformedReason: {},
			accepted: { turnOn: true, notNow: false, declined: false, noAnswer: false },
		});
	});
});
