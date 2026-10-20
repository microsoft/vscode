/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CloudSandboxEnabledSettingId, CloudSandboxRepositoryAccessResult, CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxRepositoryAccessRecovery } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, IPromptChoice, NoOpNotification } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { CloudSandboxRepositoryAccessService } from '../../../browser/remoteAgentHost/cloudSandboxRepositoryAccess.js';
import { CloudSandboxStartupError } from '../../../browser/remoteAgentHost/cloudSandboxStartupError.js';

suite('CloudSandboxRepositoryAccessService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: {
		readonly ssoRequired?: boolean;
		readonly confirm?: boolean;
		readonly opened?: boolean;
		readonly check?: ICloudSandboxRepositoryAccessRecovery['checkAccess'];
		readonly reauthenticate?: ICloudSandboxRepositoryAccessRecovery['reauthenticate'];
	} = {}) {
		const configuration = new TestConfigurationService({
			[CloudSandboxEnabledSettingId]: true,
			[RemoteAgentHostsEnabledSettingId]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const calls = {
			opened: [] as string[], openOptions: [] as Parameters<IOpenerService['open']>[1][], confirmations: [] as IConfirmation[], checks: 0, signIns: 0,
			infos: [] as string[], warnings: [] as string[], errors: [] as string[], logs: [] as string[],
			prompts: [] as { message: string; choices: IPromptChoice[] }[],
		};
		const state = { hidden: false, result: 'available' as CloudSandboxRepositoryAccessResult };
		let cancelProgress: (() => void) | undefined;
		const recovery: ICloudSandboxRepositoryAccessRecovery = {
			repository: 'example-org/project',
			accountLabel: 'account-a',
			ssoRequired: options.ssoRequired ?? false,
			checkAccess: async token => {
				calls.checks++;
				return options.check ? options.check(token) : state.result;
			},
			reauthenticate: async token => {
				calls.signIns++;
				return options.reauthenticate ? options.reauthenticate(token) : state.result;
			},
		};
		const original = new CloudSandboxRequestError(recovery.ssoRequired ? 403 : 404, 'private response');
		const service = store.add(new CloudSandboxRepositoryAccessService(
			new class extends mock<ICloudSandboxApiService>() {
				override getRepositoryAccessRecovery(error: unknown) { return error === original ? recovery : undefined; }
			}(),
			configuration,
			new class extends mock<IChatEntitlementService>() {
				override get sentiment() { return { hidden: state.hidden }; }
			}(),
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, openOptions?: Parameters<IOpenerService['open']>[1]) {
					calls.opened.push(resource.toString());
					calls.openOptions.push(openOptions);
					return options.opened ?? true;
				}
			}(),
			new class extends mock<IDialogService>() {
				override async confirm(confirmation: IConfirmation) {
					calls.confirmations.push(confirmation);
					return { confirmed: options.confirm ?? true };
				}
			}(),
			new class extends mock<IProgressService>() {
				override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
					cancelProgress = onDidCancel;
					return task({ report: () => { } });
				}
			}(),
			new class extends mock<INotificationService>() {
				override info(message: string) { calls.infos.push(message); }
				override warn(message: string) { calls.warnings.push(message); }
				override error(message: string) { calls.errors.push(message); }
				override prompt(_severity: Parameters<INotificationService['prompt']>[0], message: string, choices: IPromptChoice[]) {
					calls.prompts.push({ message, choices });
					return new NoOpNotification();
				}
			}(),
			new class extends mock<ILogService>() {
				override error(message: string) { calls.logs.push(message); }
			}(),
		));
		const actions = service.createActions(original);
		assert.ok(actions);
		const id = actions.commands[0].command.arguments?.[0];
		assert.strictEqual(typeof id, 'string');
		if (typeof id !== 'string') {
			assert.fail('Expected an opaque recovery identifier');
		}
		return { service, recovery, original, actions, id, calls, configuration, state, cancelProgress: () => cancelProgress?.() };
	}

	test('an ambiguous 404 offers only a read-only check and never starts sign-in', async () => {
		const h = createHarness();
		await h.actions.actions[0].run();
		await h.service.authorizeAccess(h.id);

		assert.deepStrictEqual({
			labels: h.actions.actions.map(action => action.label),
			checks: h.calls.checks, signIns: h.calls.signIns, opened: h.calls.opened,
			success: h.calls.infos[0], unconfirmed: h.calls.infos[1],
		}, {
			labels: ['Check Repository Access'],
			checks: 1, signIns: 0, opened: [],
			success: 'The repository access check succeeded for example-org/project. Cloud session access may still require other permissions. This check did not create a session or send your message.',
			unconfirmed: 'Check repository access first. This failure has not been confirmed as an organization sign-in problem.',
		});
	});

	test('only a confirmed repository SAML denial offers authorization', async () => {
		const h = createHarness();
		h.state.result = 'ssoRequired';
		await h.service.checkAccess(h.id);
		const prompt = h.calls.prompts[0];
		h.state.result = 'available';
		await prompt.choices[0].run();
		const detail = h.calls.confirmations[0].detail;

		assert.deepStrictEqual({
			choices: prompt.choices.map(choice => choice.label),
			opened: h.calls.opened,
			openOptions: h.calls.openOptions,
			accountNamed: typeof detail === 'string' && detail.includes('account-a'),
			checks: h.calls.checks, signIns: h.calls.signIns, errors: h.calls.errors,
		}, {
			choices: ['Authorize Access', 'Open Application Settings'],
			opened: ['https://github.com/example-org/project/pulls'],
			openOptions: [{ openExternal: true, allowContributedOpeners: false }],
			accountNamed: true,
			checks: 1, signIns: 1, errors: [],
		});
	});

	test('requires confirmation after organization sign-in before reauthenticating', async () => {
		const h = createHarness({ ssoRequired: true, confirm: false });
		await h.service.authorizeAccess(h.id);

		assert.deepStrictEqual({
			opened: h.calls.opened, confirmations: h.calls.confirmations.length,
			signIns: h.calls.signIns, checks: h.calls.checks, errors: h.calls.errors,
		}, { opened: ['https://github.com/example-org/project/pulls'], confirmations: 1, signIns: 0, checks: 0, errors: [] });
	});

	test('transcript arguments contain only an opaque identifier, not the account or repository', () => {
		const h = createHarness({ ssoRequired: true });
		const error = new CloudSandboxStartupError(h.original, 'creation', new class extends mock<ICommandService>() { }(), h.service);
		assert.deepStrictEqual({
			message: error.message,
			labels: error.actions.map(action => action.label),
			commands: error.recoveryCommands.map(button => ({ label: button.command.title, opaque: typeof button.command.arguments?.[0] === 'string' && /^[\da-f-]{36}$/.test(button.command.arguments[0]), argumentCount: button.command.arguments?.length })),
			containsPrivateContext: /account-a|private|example-org\/project/.test(JSON.stringify(error.recoveryCommands)),
		}, {
			message: 'Couldn\'t start the cloud session. GitHub requires single sign-on authorization to access example-org/project. Complete organization sign-in and authorize VS Code, then check repository access again.',
			labels: ['Authorize Access', 'Check Repository Access', 'Show Details'],
			commands: [{ label: 'Authorize Access', opaque: true, argumentCount: 1 }, { label: 'Check Repository Access', opaque: true, argumentCount: 1 }],
			containsPrivateContext: false,
		});
	});

	for (const disabledBy of ['cloud', 'remote', 'ai', 'hidden'] as const) {
		test(`does not open a browser or check access when ${disabledBy} is disabled`, async () => {
			const h = createHarness({ ssoRequired: true });
			if (disabledBy === 'hidden') {
				h.state.hidden = true;
			} else {
				await h.configuration.setUserConfiguration(disabledBy === 'cloud' ? CloudSandboxEnabledSettingId : disabledBy === 'remote' ? RemoteAgentHostsEnabledSettingId : ChatAIDisabledSettingId, disabledBy === 'ai');
			}
			await h.service.checkAccess(h.id);
			await h.service.authorizeAccess(h.id);
			assert.deepStrictEqual({
				opened: h.calls.opened, checks: h.calls.checks, signIns: h.calls.signIns, warnings: h.calls.warnings.length,
				actions: h.service.createActions(h.original),
			}, { opened: [], checks: 0, signIns: 0, warnings: 2, actions: undefined });
		});
	}

	test('shares concurrent access checks without creating another operation', async () => {
		const pending = new DeferredPromise<CloudSandboxRepositoryAccessResult>();
		const h = createHarness({ check: () => pending.p });
		const first = h.service.checkAccess(h.id);
		const second = h.service.checkAccess(h.id);
		await pending.complete('available');
		await Promise.all([first, second]);
		assert.deepStrictEqual({ checks: h.calls.checks, results: h.calls.infos.length }, { checks: 1, results: 1 });
	});

	test('allows an access check during sign-in without starting a second sign-in', async () => {
		const pending = new DeferredPromise<CloudSandboxRepositoryAccessResult>();
		const entered = new DeferredPromise<void>();
		const h = createHarness({
			ssoRequired: true,
			reauthenticate: () => {
				void entered.complete();
				return pending.p;
			},
		});
		const first = h.service.authorizeAccess(h.id);
		await entered.p;
		const second = h.service.authorizeAccess(h.id);
		await h.service.checkAccess(h.id);
		const beforeCompletion = { checks: h.calls.checks, signIns: h.calls.signIns, browserOpens: h.calls.opened.length };
		await pending.complete('available');
		await Promise.all([first, second]);
		assert.deepStrictEqual({ beforeCompletion, reportedPending: h.calls.infos.includes('GitHub sign-in is already in progress. Complete or cancel that sign-in before starting another.') }, {
			beforeCompletion: { checks: 1, signIns: 1, browserOpens: 1 },
			reportedPending: true,
		});
	});

	for (const cancelFrom of ['progress', 'dispose'] as const) {
		test(`does not report success after cancellation from ${cancelFrom}`, async () => {
			const pending = new DeferredPromise<CloudSandboxRepositoryAccessResult>();
			let token: CancellationToken | undefined;
			const h = createHarness({ check: requestToken => { token = requestToken; return pending.p; } });
			const checking = h.service.checkAccess(h.id);
			if (cancelFrom === 'progress') {
				h.cancelProgress();
			} else {
				h.service.dispose();
			}
			await pending.complete('available');
			await checking;
			assert.deepStrictEqual({ cancelled: token?.isCancellationRequested, infos: h.calls.infos, errors: h.calls.errors }, { cancelled: true, infos: [], errors: [] });
		});
	}

	test('does not show an error when the user cancels GitHub login', async () => {
		const h = createHarness({ ssoRequired: true, reauthenticate: async () => { throw new CancellationError(); } });
		await h.service.authorizeAccess(h.id);
		assert.deepStrictEqual({ signIns: h.calls.signIns, errors: h.calls.errors, logs: h.calls.logs }, { signIns: 1, errors: [], logs: [] });
	});

	test('shows failures without exposing response text or authorization URLs', async () => {
		const h = createHarness({ check: async () => { throw new Error('private-token authorization_request=private'); } });
		await h.service.checkAccess(h.id);
		assert.deepStrictEqual({
			errors: h.calls.errors, logs: h.calls.logs, infos: h.calls.infos,
		}, {
			errors: ['Could not complete the repository access check or sign-in. Check your connection and try again. No cloud session was started by this action.'],
			logs: ['[CloudSandbox] Repository access recovery failed.'],
			infos: [],
		});
	});

	test('does not let an expired action recover a newer failure', async () => {
		const h = createHarness({ ssoRequired: true });
		for (let i = 0; i < 32; i++) {
			h.service.createActions(h.original);
		}
		await h.service.authorizeAccess(h.id);
		assert.deepStrictEqual({ opened: h.calls.opened, signIns: h.calls.signIns, warnings: h.calls.warnings }, {
			opened: [], signIns: 0,
			warnings: ['This repository access check is no longer available. You can review organization access in GitHub Settings > Applications.'],
		});
	});
});
