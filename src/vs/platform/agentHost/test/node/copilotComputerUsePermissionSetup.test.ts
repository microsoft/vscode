/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ElicitationResult, ElicitationSchema } from '@github/copilot-sdk';
import { timeout } from '../../../../base/common/async.js';
import { hasKey } from '../../../../base/common/types.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { COMPUTER_USE_REQUEST_KEY, type ComputerUsePermission } from '../../common/computerUse.js';
import { ChatInputRequestPurpose, readChatInputRequestPurpose } from '../../common/meta/agentChatInputRequestMeta.js';
import { readComputerUseSetupCard } from '../../common/meta/computerUse.js';
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, type ChatInputRequest } from '../../common/state/sessionState.js';
import { AgentHostMacAccessibilityTrustService } from '../../node/agentHostMacAccessibilityTrustService.js';
import { classifyComputerUsePrompt, CopilotComputerUsePermissionSetup, parseComputerUsePermissionPrompt, type ICopilotComputerUseHelperApp, type ICopilotComputerUseSetupChat } from '../../node/copilot/copilotComputerUsePermissionSetup.js';
import { computerUsePermissionSchema, TestComputerUseConfiguration } from './copilotComputerUseTestUtils.js';

class TestSetupChat implements ICopilotComputerUseSetupChat {
	readonly requests: ChatInputRequest[] = [];
	readonly completions: { readonly requestId: string; readonly response: ChatInputResponseKind }[] = [];

	constructor(readonly chatUri: string) { }

	requestInput(request: ChatInputRequest): void {
		this.requests.push(request);
	}

	completeInput(requestId: string, response: ChatInputResponseKind): void {
		this.completions.push({ requestId, response });
	}
}

/** The ordinary form of a permission prompt, which the session hands to the setup for clients without its UI. */
function promptInput(missing: readonly ComputerUsePermission[], settings: readonly ComputerUsePermission[] = []): ChatInputRequest {
	const field = computerUsePermissionSchema(missing, settings).properties.choice;
	const choices = field.type === 'string' && hasKey(field, { enum: true }) ? field.enum : [];
	return {
		id: 'session-request-id',
		message: 'Copilot Computer Use needs macOS permissions',
		questions: [{
			kind: ChatInputQuestionKind.SingleSelect,
			id: 'choice',
			title: 'choice',
			message: 'choice',
			required: true,
			options: choices.map(value => ({ id: value, label: value })),
		}],
	};
}

suite('CopilotComputerUsePermissionSetup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSetup(helperApp?: ICopilotComputerUseHelperApp) {
		const configuration = store.add(new TestComputerUseConfiguration());
		const accessibilityTrust = new AgentHostMacAccessibilityTrustService();
		const setup = store.add(new CopilotComputerUsePermissionSetup(helperApp, configuration, new NullLogService(), accessibilityTrust));
		return { configuration, setup, accessibilityTrust };
	}

	function prompt(setup: CopilotComputerUsePermissionSetup, chat: ICopilotComputerUseSetupChat, missing: readonly ComputerUsePermission[], settings: readonly ComputerUsePermission[] = []) {
		const offered = parseComputerUsePermissionPrompt(computerUsePermissionSchema(missing, settings));
		assert.ok(offered);
		const results: ElicitationResult[] = [];
		const done = setup.handlePrompt(chat, offered, promptInput(missing, settings)).then(result => { results.push(result); return result; });
		return { results, done };
	}

	test('recognizes the plugin\'s permission prompt only by its structured choices', () => {
		const choice = (values: unknown[]) => parseComputerUsePermissionPrompt({ type: 'object', properties: { choice: { type: 'string', enum: values as string[] } }, required: ['choice'] });
		const describe = (offered: ReturnType<typeof parseComputerUsePermissionPrompt>) => offered && { missing: [...offered.missing], settings: [...offered.settings] };
		assert.deepStrictEqual({
			both: describe(parseComputerUsePermissionPrompt(computerUsePermissionSchema(['accessibility', 'screenRecording']))),
			settingsFallback: describe(parseComputerUsePermissionPrompt(computerUsePermissionSchema(['screenRecording'], ['screenRecording']))),
			unknownChoice: describe(choice(['request_accessibility', 'request_camera', 'try_again'])),
			nonStringChoice: describe(choice(['request_accessibility', 3, 'try_again'])),
			withoutRecheck: describe(choice(['request_accessibility'])),
			withoutRequest: describe(choice(['try_again'])),
			settingsWithoutRequest: describe(choice(['request_accessibility', 'settings_screen_recording', 'try_again'])),
			extraField: describe(parseComputerUsePermissionPrompt({ type: 'object', properties: { ...computerUsePermissionSchema(['accessibility']).properties, note: { type: 'string' } }, required: ['choice'] })),
			optionalChoice: describe(parseComputerUsePermissionPrompt({ ...computerUsePermissionSchema(['accessibility']), required: [] })),
			consentPrompt: describe(parseComputerUsePermissionPrompt({ type: 'object', properties: { choice: { type: 'string', enum: ['allow', 'always'] } }, required: ['choice'] })),
			noSchema: describe(parseComputerUsePermissionPrompt(undefined)),
		}, {
			both: { missing: ['accessibility', 'screenRecording'], settings: [] },
			settingsFallback: { missing: ['screenRecording'], settings: ['screenRecording'] },
			unknownChoice: undefined,
			nonStringChoice: undefined,
			withoutRecheck: undefined,
			withoutRequest: undefined,
			settingsWithoutRequest: undefined,
			extraField: undefined,
			optionalChoice: undefined,
			consentPrompt: undefined,
			noSchema: undefined,
		});
	});

	test('classifies the plugin\'s other prompts, inferring nothing from unrecognized permission prompts', () => {
		const form = (properties: ElicitationSchema['properties']): ElicitationSchema => ({ type: 'object', properties, required: Object.keys(properties) });
		assert.deepStrictEqual({
			recognized: classifyComputerUsePrompt(computerUsePermissionSchema(['accessibility'])).kind,
			newChoice: classifyComputerUsePrompt(form({ choice: { type: 'string', enum: ['request_accessibility', 'request_camera', 'try_again'] } })).kind,
			newField: classifyComputerUsePrompt(form({ ...computerUsePermissionSchema(['accessibility']).properties, remember: { type: 'boolean' } })).kind,
			oneOf: classifyComputerUsePrompt(form({ choice: { type: 'string', oneOf: [{ const: 'try_again', title: 'Try again' }] } })).kind,
			arrayChoices: classifyComputerUsePrompt(form({ choices: { type: 'array', items: { anyOf: [{ const: 'settings_accessibility', title: 'Open' }] } } })).kind,
			consent: classifyComputerUsePrompt(form({ choice: { type: 'string', title: 'Allow access', enum: ['allow', 'always'] } })).kind,
			foreground: classifyComputerUsePrompt(form({ choice: { type: 'string', enum: ['allow_foreground', 'keep_background'] } })).kind,
			malformed: classifyComputerUsePrompt({ type: 'object', properties: { choice: 'request_accessibility', list: { type: 'array' } } } as unknown as ElicitationSchema).kind,
			noSchema: classifyComputerUsePrompt(undefined).kind,
		}, {
			recognized: 'permissions',
			newChoice: 'unrecognizedPermissions',
			newField: 'unrecognizedPermissions',
			oneOf: 'unrecognizedPermissions',
			arrayChoices: 'unrecognizedPermissions',
			consent: 'other',
			foreground: 'other',
			malformed: 'other',
			noSchema: 'other',
		});
	});

	test('ends a setup without verifying anything when the plugin asks for permissions in an unrecognized form', async () => {
		const run = async (sendAction: boolean) => {
			const { configuration, setup } = createSetup();
			const chat = new TestSetupChat('chat:a');
			const pending = prompt(setup, chat, ['accessibility', 'screenRecording']);
			if (sendAction) {
				configuration.send({ setupId: configuration.status?.setups[0]?.id ?? '', round: 1, action: 'recheck' });
			}
			setup.onUnrecognizedPrompt(chat);
			return {
				result: await pending.done,
				setup: configuration.status?.setups.map(candidate => ({ state: candidate.state, error: candidate.error?.code })),
				permissions: configuration.status?.permissions.map(permission => permission.state),
				cardCompletions: chat.completions.map(completion => completion.response),
			};
		};
		assert.deepStrictEqual({ working: await run(true), waiting: await run(false) }, {
			working: { result: { action: 'accept', content: { choice: 'try_again' } }, setup: [{ state: 'ended', error: undefined }], permissions: ['notGranted', 'notGranted'], cardCompletions: [ChatInputResponseKind.Cancel] },
			waiting: { result: { action: 'cancel' }, setup: [{ state: 'ended', error: undefined }], permissions: ['notGranted', 'notGranted'], cardCompletions: [ChatInputResponseKind.Cancel] },
		});
	});

	test('shows one request per setup, updates it in place, and reports verified permissions', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const initial = configuration.status;

		const first = prompt(setup, chat, ['accessibility', 'screenRecording']);
		const needsBoth = configuration.status;
		const setupId = needsBoth?.setups[0]?.id ?? '';
		configuration.send({ setupId, round: 1, action: 'allow', permission: 'accessibility' });
		const working = configuration.status;
		await first.done;

		const second = prompt(setup, chat, ['screenRecording'], ['screenRecording']);
		await timeout(0);

		assert.deepStrictEqual({
			initial,
			needsBoth: { permissions: needsBoth?.permissions, setups: needsBoth?.setups.map(({ id, ...rest }) => rest) },
			working: { operation: working?.operation, state: working?.setups[0]?.state, actions: working?.setups[0]?.actions },
			firstAnswer: first.results,
			card: { purpose: readChatInputRequestPurpose(chat.requests[0]), setup: readComputerUseSetupCard(chat.requests[0]), message: chat.requests[0].message, questions: chat.requests[0].questions?.map(question => question.id) },
			sameCard: chat.requests.length === 2 && chat.requests[1].id === chat.requests[0].id && chat.requests[0].id !== 'session-request-id',
			second: { permissions: configuration.status?.permissions, setups: configuration.status?.setups.map(({ id, ...rest }) => rest), pending: second.results },
		}, {
			initial: { schemaVersion: 1, permissions: [{ permission: 'accessibility', state: 'unknown' }, { permission: 'screenRecording', state: 'unknown' }], setups: [] },
			needsBoth: {
				permissions: [{ permission: 'accessibility', state: 'notGranted' }, { permission: 'screenRecording', state: 'notGranted' }],
				setups: [{
					chat: 'chat:a', state: 'needsPermissions', round: 1,
					actions: [{ action: 'allow', permission: 'accessibility' }, { action: 'allow', permission: 'screenRecording' }, { action: 'recheck' }],
				}],
			},
			working: { operation: { setupId, action: 'allow', permission: 'accessibility' }, state: 'working', actions: [] },
			firstAnswer: [{ action: 'accept', content: { choice: 'request_accessibility' } }],
			card: { purpose: ChatInputRequestPurpose.Elicitation, setup: { setupId }, message: 'Copilot Computer Use needs macOS permissions', questions: ['choice'] },
			sameCard: true,
			second: {
				permissions: [{ permission: 'accessibility', state: 'granted' }, { permission: 'screenRecording', state: 'notGranted' }],
				setups: [{
					chat: 'chat:a', state: 'needsPermissions', round: 2,
					actions: [{ action: 'allow', permission: 'screenRecording' }, { action: 'recheck' }],
				}],
				pending: [],
			},
		});
	});

	test('asks macOS natively the first time Allow is chosen, and opens System Settings on a later Allow in the same loop', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const first = prompt(setup, chat, ['accessibility', 'screenRecording']);
		const setupId = configuration.status?.setups[0]?.id ?? '';
		configuration.send({ setupId, round: 1, action: 'allow', permission: 'accessibility' });
		await first.done;
		const second = prompt(setup, chat, ['accessibility', 'screenRecording'], ['accessibility']);
		configuration.send({ setupId, round: 2, action: 'allow', permission: 'accessibility' });
		const openingSettings = configuration.status?.operation;
		await second.done;
		const third = prompt(setup, chat, ['accessibility', 'screenRecording'], ['accessibility']);
		configuration.send({ setupId, round: 3, action: 'allow', permission: 'screenRecording' });
		await third.done;

		assert.deepStrictEqual({ answers: [...first.results, ...second.results, ...third.results], openingSettings }, {
			answers: [
				{ action: 'accept', content: { choice: 'request_accessibility' } },
				{ action: 'accept', content: { choice: 'settings_accessibility' } },
				{ action: 'accept', content: { choice: 'request_screen_recording' } },
			],
			openingSettings: { setupId, action: 'allow', permission: 'accessibility' },
		});
	});

	test('in a new loop, asks macOS again for a permission it already asked for, then opens System Settings on its own', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const firstLoop = prompt(setup, chat, ['accessibility']);
		configuration.send({ setupId: configuration.status?.setups[0]?.id ?? '', round: 1, action: 'allow', permission: 'accessibility' });
		await firstLoop.done;
		// The waiting tool call timed out, and the next one starts a new loop, which offers no System Settings pane yet.
		setup.onToolCallCompleted(chat, false);
		const newLoop = prompt(setup, chat, ['accessibility']);
		const setupId = configuration.status?.setups[1]?.id ?? '';
		const publishedBefore = configuration.published.length;
		configuration.send({ setupId, round: 1, action: 'allow', permission: 'accessibility' });
		await newLoop.done;
		const next = prompt(setup, chat, ['accessibility'], ['accessibility']);
		await next.done;

		assert.deepStrictEqual({
			answers: [...firstLoop.results, ...newLoop.results, ...next.results],
			published: configuration.published.slice(publishedBefore).map(status => {
				const candidate = status?.setups.find(entry => entry.id === setupId);
				return { state: candidate?.state, round: candidate?.round, operation: status?.operation };
			}),
		}, {
			answers: [
				{ action: 'accept', content: { choice: 'request_accessibility' } },
				{ action: 'accept', content: { choice: 'request_accessibility' } },
				{ action: 'accept', content: { choice: 'settings_accessibility' } },
			],
			// The setup goes from one step of the user's Allow to the next without waiting in between.
			published: [
				{ state: 'working', round: 1, operation: { setupId, action: 'allow', permission: 'accessibility' } },
				{ state: 'working', round: 2, operation: { setupId, action: 'allow', permission: 'accessibility' } },
			],
		});
	});

	test('drops duplicate, stale, unoffered and malformed requests', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const first = prompt(setup, chat, ['accessibility', 'screenRecording']);
		const setupId = configuration.status?.setups[0]?.id ?? '';
		const nonce = configuration.send({ setupId, round: 1, action: 'recheck' });
		await first.done;
		const second = prompt(setup, chat, ['accessibility']);

		configuration.send({ setupId, round: 2, action: 'recheck', nonce });
		configuration.send({ setupId, round: 1, action: 'allow', permission: 'accessibility' });
		configuration.send({ setupId, round: 2, action: 'allow', permission: 'screenRecording' });
		configuration.send({ setupId: 'unknown', round: 2, action: 'recheck' });
		configuration.updateRootConfig({ [COMPUTER_USE_REQUEST_KEY]: { nonce: 'n', setupId, round: 2, action: 'allow' } });
		configuration.updateRootConfig({ [COMPUTER_USE_REQUEST_KEY]: { nonce: 'm', setupId, round: 2, action: 'request', permission: 'accessibility' } });
		await timeout(0);

		assert.deepStrictEqual({
			first: first.results,
			second: second.results,
			state: configuration.status?.setups[0]?.state,
			requestKey: configuration.values[COMPUTER_USE_REQUEST_KEY],
		}, {
			first: [{ action: 'accept', content: { choice: 'try_again' } }],
			second: [],
			state: 'needsPermissions',
			requestKey: undefined,
		});
	});

	test('reports a check that changed nothing, and verifies readiness only when the waiting tool call succeeds', async () => {
		const run = async (success: boolean) => {
			const { configuration, setup } = createSetup();
			const chat = new TestSetupChat('chat:a');
			const first = prompt(setup, chat, ['accessibility', 'screenRecording']);
			const setupId = configuration.status?.setups[0]?.id ?? '';
			configuration.send({ setupId, round: 1, action: 'recheck' });
			await first.done;
			prompt(setup, chat, ['accessibility', 'screenRecording']);
			const stillOff = configuration.status?.setups[0]?.error?.code;
			configuration.send({ setupId, round: 2, action: 'recheck' });
			setup.onToolCallCompleted(chat, success);
			return {
				stillOff,
				state: configuration.status?.setups[0]?.state,
				error: configuration.status?.setups[0]?.error?.code,
				permissions: configuration.status?.permissions.map(permission => permission.state),
				cardCompletions: chat.completions.map(completion => completion.response),
			};
		};
		assert.deepStrictEqual({ succeeded: await run(true), failed: await run(false) }, {
			succeeded: { stillOff: 'stillNotGranted', state: 'ready', error: undefined, permissions: ['granted', 'granted'], cardCompletions: [ChatInputResponseKind.Accept] },
			failed: { stillOff: 'stillNotGranted', state: 'ended', error: undefined, permissions: ['notGranted', 'notGranted'], cardCompletions: [ChatInputResponseKind.Cancel] },
		});
	});

	test('publishes no error for a setup that ended, however it ended', async () => {
		const end = async (stop: (setup: CopilotComputerUsePermissionSetup, chat: TestSetupChat) => void, whileWorking = false) => {
			const { configuration, setup } = createSetup();
			const chat = new TestSetupChat('chat:a');
			const pending = prompt(setup, chat, ['accessibility']);
			if (whileWorking) {
				configuration.send({ setupId: configuration.status?.setups[0]?.id ?? '', round: 1, action: 'recheck' });
			}
			stop(setup, chat);
			await pending.done;
			return configuration.status?.setups.map(({ id, ...rest }) => rest);
		};
		const ended = [{ chat: 'chat:a', state: 'ended', round: 1, actions: [] }];
		assert.deepStrictEqual({
			timedOutWhileWaiting: await end((setup, chat) => setup.onToolCallCompleted(chat, false)),
			timedOutWhileWorking: await end((setup, chat) => setup.onToolCallCompleted(chat, false), true),
			chatStopped: await end((setup, chat) => setup.cancelChat(chat)),
			declined: await end((setup, chat) => setup.respondToInput(chat, chat.requests[0].id, ChatInputResponseKind.Decline, undefined)),
			unrecognizedPrompt: await end((setup, chat) => setup.onUnrecognizedPrompt(chat)),
		}, {
			timedOutWhileWaiting: ended,
			timedOutWhileWorking: ended,
			chatStopped: ended,
			declined: ended,
			unrecognizedPrompt: ended,
		});
	});

	test('lets the other waiting setups check again on their own once one is ready, even right after macOS asked for Accessibility', () => runWithFakedTimers({}, async () => {
		const { configuration, setup } = createSetup();
		const [chatA, chatB] = [new TestSetupChat('chat:a'), new TestSetupChat('chat:b')];
		const a = prompt(setup, chatA, ['accessibility']);
		const b = prompt(setup, chatB, ['accessibility']);
		const setupA = configuration.status?.setups[0]?.id ?? '';
		configuration.send({ setupId: setupA, round: 1, action: 'allow', permission: 'accessibility' });
		await a.done;
		// macOS asked for Accessibility, and the user turned it on before checking again.
		const again = prompt(setup, chatA, ['accessibility'], ['accessibility']);
		configuration.send({ setupId: setupA, round: 2, action: 'recheck' });
		await again.done;
		setup.onToolCallCompleted(chatA, true);
		await timeout(0);
		const checkedOnItsOwn = [...b.results];
		setup.onToolCallCompleted(chatB, true);

		assert.deepStrictEqual({ checkedOnItsOwn, setups: configuration.status?.setups.map(candidate => candidate.state) }, {
			checkedOnItsOwn: [{ action: 'accept', content: { choice: 'try_again' } }],
			setups: ['ready', 'ready'],
		});
	}));

	test('sends exactly the choice a client without the setup UI picked, and remembers its native requests', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const answer = async (choice: string) => {
			const pending = prompt(setup, chat, ['accessibility'], ['accessibility']);
			setup.respondToInput(chat, chat.requests.at(-1)?.id ?? '', ChatInputResponseKind.Accept, { choice: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: choice } } });
			return pending.done;
		};
		// Nothing asked macOS natively yet, so Allow would ask first.
		const openSettings = await answer('settings_accessibility');
		const request = await answer('request_accessibility');
		// macOS asked already, so Allow would open System Settings.
		const requestAgain = await answer('request_accessibility');
		const allow = prompt(setup, chat, ['accessibility'], ['accessibility']);
		configuration.send({ setupId: configuration.status?.setups[0]?.id ?? '', round: 4, action: 'allow', permission: 'accessibility' });

		assert.deepStrictEqual({ openSettings, request, requestAgain, allow: await allow.done }, {
			openSettings: { action: 'accept', content: { choice: 'settings_accessibility' } },
			request: { action: 'accept', content: { choice: 'request_accessibility' } },
			requestAgain: { action: 'accept', content: { choice: 'request_accessibility' } },
			allow: { action: 'accept', content: { choice: 'settings_accessibility' } },
		});
	});

	test('treats another prompt of the plugin after an action as verified readiness', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const first = prompt(setup, chat, ['screenRecording']);
		setup.onOtherPrompt(chat);
		const stillWaiting = configuration.status?.setups[0]?.state;
		configuration.send({ setupId: configuration.status?.setups[0]?.id ?? '', round: 1, action: 'recheck' });
		await first.done;
		setup.onOtherPrompt(chat);
		assert.deepStrictEqual({ stillWaiting, state: configuration.status?.setups[0]?.state, permissions: configuration.status?.permissions.map(permission => permission.state) }, {
			stillWaiting: 'needsPermissions',
			state: 'ready',
			permissions: ['granted', 'granted'],
		});
	});

	test('publishes the helper app, with its icon once the plugin found permissions missing', async () => {
		const path = '/Users/me/.copilot/computer-use/Copilot Computer Use.app';
		const icon = 'data:image/png;base64,iVBORw0KGgo=';
		const reads: string[] = [];
		const { configuration, setup } = createSetup({ path, readIcon: async () => { reads.push(path); return icon; } });
		await timeout(0);
		const beforePrompt = { helperApp: configuration.status?.helperApp, reads: reads.length };
		prompt(setup, new TestSetupChat('chat:a'), ['accessibility']);
		await timeout(0);
		prompt(setup, new TestSetupChat('chat:b'), ['accessibility']);
		await timeout(0);
		assert.deepStrictEqual({ beforePrompt, afterPrompts: { helperApp: configuration.status?.helperApp, reads: reads.length }, unknown: createSetup().configuration.status?.helperApp }, {
			beforePrompt: { helperApp: { path }, reads: 0 },
			afterPrompts: { helperApp: { path, icon }, reads: 1 },
			unknown: undefined,
		});
	});

	test('checks again on its own when macOS changes Accessibility, except while macOS asks for it', () => runWithFakedTimers({}, async () => {
		const { configuration, setup, accessibilityTrust } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const first = prompt(setup, chat, ['accessibility', 'screenRecording']);
		const screenRecordingOnly = prompt(setup, new TestSetupChat('chat:b'), ['screenRecording']);
		const setupId = configuration.status?.setups[0]?.id ?? '';

		// One switch in System Settings can report several changes; the setup checks once, after they settle.
		accessibilityTrust.reportChange();
		await timeout(300);
		accessibilityTrust.reportChange();
		await timeout(400);
		const settling = first.results.length;
		await timeout(600);
		const checked = { settling, first: first.results, screenRecordingOnly: screenRecordingOnly.results };
		const second = prompt(setup, chat, ['accessibility', 'screenRecording']);
		const unchanged = { state: configuration.status?.setups[0]?.state, error: configuration.status?.setups[0]?.error };

		// Asking for Accessibility adds the app to macOS's list while macOS shows its prompt, which the helper holds.
		configuration.send({ setupId, round: 2, action: 'allow', permission: 'accessibility' });
		accessibilityTrust.reportChange();
		await timeout(1000);
		const third = prompt(setup, chat, ['accessibility', 'screenRecording'], ['accessibility']);
		accessibilityTrust.reportChange();
		await timeout(1600);
		accessibilityTrust.reportChange();
		await timeout(1000);
		const whileAsking = third.results.length;
		accessibilityTrust.reportChange();
		await timeout(1000);

		assert.deepStrictEqual({ checked, unchanged, second: second.results, whileAsking, third: third.results }, {
			checked: { settling: 0, first: [{ action: 'accept', content: { choice: 'try_again' } }], screenRecordingOnly: [] },
			unchanged: { state: 'needsPermissions', error: undefined },
			second: [{ action: 'accept', content: { choice: 'request_accessibility' } }],
			whileAsking: 0,
			third: [{ action: 'accept', content: { choice: 'try_again' } }],
		});
	}));

	test('ignores an Accessibility change reported behind a request for Accessibility', () => runWithFakedTimers({}, async () => {
		const { configuration, setup, accessibilityTrust } = createSetup();
		const [chatA, chatB, chatC] = [new TestSetupChat('chat:a'), new TestSetupChat('chat:b'), new TestSetupChat('chat:c')];
		prompt(setup, chatA, ['screenRecording']);
		prompt(setup, chatB, ['accessibility']);
		const c = prompt(setup, chatC, ['accessibility']);
		const [setupA, setupB] = configuration.status?.setups.map(candidate => candidate.id) ?? [];

		// A's request runs while B's Allow waits; a check queued now would run as macOS shows B's prompt.
		configuration.send({ setupId: setupA, round: 1, action: 'allow', permission: 'screenRecording' });
		configuration.send({ setupId: setupB, round: 1, action: 'allow', permission: 'accessibility' });
		accessibilityTrust.reportChange();
		await timeout(1000);
		prompt(setup, chatA, ['screenRecording'], ['screenRecording']);
		prompt(setup, chatB, ['accessibility'], ['accessibility']);
		await timeout(1000);

		assert.deepStrictEqual(c.results, []);
	}));

	test('lets the user\'s action replace an automatic check waiting for its setup', () => runWithFakedTimers({}, async () => {
		const { configuration, setup, accessibilityTrust } = createSetup();
		const [chatA, chatB] = [new TestSetupChat('chat:a'), new TestSetupChat('chat:b')];
		prompt(setup, chatA, ['accessibility']);
		const b = prompt(setup, chatB, ['accessibility']);
		const setupB = configuration.status?.setups[1]?.id ?? '';

		// A's automatic check runs while B's waits, and B's user chooses Allow meanwhile.
		accessibilityTrust.reportChange();
		await timeout(1000);
		configuration.send({ setupId: setupB, round: 1, action: 'allow', permission: 'accessibility' });
		prompt(setup, chatA, ['accessibility']);
		await timeout(0);

		assert.deepStrictEqual(b.results, [{ action: 'accept', content: { choice: 'request_accessibility' } }]);
	}));

	test('runs one action at a time across chats so native prompts never overlap', async () => {
		const { configuration, setup } = createSetup();
		const chatA = new TestSetupChat('chat:a');
		const chatB = new TestSetupChat('chat:b');
		const a = prompt(setup, chatA, ['accessibility']);
		const b = prompt(setup, chatB, ['accessibility']);
		const [setupA, setupB] = configuration.status?.setups.map(candidate => candidate.id) ?? [];
		configuration.send({ setupId: setupA, round: 1, action: 'allow', permission: 'accessibility' });
		configuration.send({ setupId: setupB, round: 1, action: 'allow', permission: 'accessibility' });
		await timeout(0);
		const whileAWorks = { a: a.results.length, b: b.results.length, operation: configuration.status?.operation?.setupId === setupA };
		prompt(setup, chatA, ['accessibility'], ['accessibility']);
		await timeout(0);
		assert.deepStrictEqual({ whileAWorks, b: b.results, operation: configuration.status?.operation?.setupId === setupB }, {
			whileAWorks: { a: 1, b: 0, operation: true },
			b: [{ action: 'accept', content: { choice: 'request_accessibility' } }],
			operation: true,
		});
	});

	test('takes answers from clients without the setup UI and remembers a decline for the rest of the turn', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const selected = (value: string) => ({ choice: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value } } } as const);

		const first = prompt(setup, chat, ['accessibility']);
		const handledFirst = setup.respondToInput(chat, chat.requests[0].id, ChatInputResponseKind.Accept, selected('request_accessibility'));
		await first.done;
		const second = prompt(setup, chat, ['accessibility'], ['accessibility']);
		setup.respondToInput(chat, chat.requests[1].id, ChatInputResponseKind.Accept, undefined);
		await second.done;
		const third = prompt(setup, chat, ['accessibility'], ['accessibility']);
		const unknownRequest = setup.respondToInput(chat, 'other-request', ChatInputResponseKind.Accept, undefined);
		setup.respondToInput(chat, chat.requests[2].id, ChatInputResponseKind.Decline, undefined);
		await third.done;
		const fourth = prompt(setup, chat, ['accessibility']);
		await fourth.done;
		const cardsWhileDeclined = chat.requests.length;
		setup.cancelChat(chat);
		const nextTurn = prompt(setup, chat, ['accessibility']);

		assert.deepStrictEqual({
			handledFirst,
			unknownRequest,
			answers: [...first.results, ...second.results, ...third.results, ...fourth.results],
			freshCardPerCompletedRequest: new Set(chat.requests.slice(0, 3).map(request => request.id)).size,
			cardsWhileDeclined,
			nextTurn: { cards: chat.requests.length, pending: nextTurn.results, state: configuration.status?.setups.at(-1)?.state },
		}, {
			handledFirst: true,
			unknownRequest: false,
			answers: [
				{ action: 'accept', content: { choice: 'request_accessibility' } },
				{ action: 'accept', content: { choice: 'try_again' } },
				{ action: 'decline' },
				{ action: 'decline' },
			],
			freshCardPerCompletedRequest: 3,
			cardsWhileDeclined: 3,
			nextTurn: { cards: 4, pending: [], state: 'needsPermissions' },
		});
	});

	test('completes each prompt exactly once when its chat stops waiting', async () => {
		const { configuration, setup } = createSetup();
		const chat = new TestSetupChat('chat:a');
		const other = new TestSetupChat('chat:b');
		const cancelled = prompt(setup, chat, ['accessibility']);
		const stopped = prompt(setup, other, ['screenRecording']);
		const [cancelledId, stoppedId] = configuration.status?.setups.map(candidate => candidate.id) ?? [];

		setup.cancelChat(chat);
		setup.cancelChat(chat);
		configuration.send({ setupId: cancelledId, round: 1, action: 'recheck' });
		setup.onToolCallCompleted(other, false);
		await timeout(0);

		assert.deepStrictEqual({
			cancelled: cancelled.results,
			stopped: stopped.results,
			setups: configuration.status?.setups.map(candidate => ({ own: candidate.id === cancelledId || candidate.id === stoppedId, state: candidate.state, error: candidate.error?.code })),
			// The turn is over, so its request is left as the turn left it; a stopped tool call's request is closed.
			cardCompletions: { cancelled: chat.completions, stopped: other.completions.map(completion => completion.response) },
		}, {
			cancelled: [{ action: 'cancel' }],
			stopped: [{ action: 'cancel' }],
			setups: [{ own: true, state: 'ended', error: undefined }, { own: true, state: 'ended', error: undefined }],
			cardCompletions: { cancelled: [], stopped: [ChatInputResponseKind.Cancel] },
		});
	});

	test('withdraws its status and cancels waiting prompts when disposed, and discards a request from before it existed', async () => {
		const configuration = store.add(new TestComputerUseConfiguration());
		configuration.values[COMPUTER_USE_REQUEST_KEY] = { nonce: 'early', setupId: 'unknown', round: 1, action: 'recheck' };
		const setup = new CopilotComputerUsePermissionSetup(undefined, configuration, new NullLogService(), new AgentHostMacAccessibilityTrustService());
		const discarded = configuration.values[COMPUTER_USE_REQUEST_KEY];
		const pending = prompt(setup, new TestSetupChat('chat:a'), ['accessibility']);
		setup.dispose();
		const afterDispose = await setup.handlePrompt(new TestSetupChat('chat:a'), { missing: new Set(['accessibility']), settings: new Set() }, promptInput(['accessibility']));

		assert.deepStrictEqual({ discarded, pending: await pending.done, status: configuration.published.at(-1), afterDispose }, {
			discarded: undefined,
			pending: { action: 'cancel' },
			status: undefined,
			afterDispose: { action: 'cancel' },
		});
	});
});
