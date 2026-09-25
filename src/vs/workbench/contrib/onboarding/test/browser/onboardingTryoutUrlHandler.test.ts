/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOnboardingTryoutRunOptions } from '../../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IURLHandler, IURLService } from '../../../../../platform/url/common/url.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { OnboardingTryoutUrlHandler } from '../../browser/onboardingTryoutUrlHandler.js';
import { IOnboardingTryoutScenario, IOnboardingTryoutService, OnboardingTryoutAvailability, parseExternalOnboardingTryoutUri, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../common/onboardingTryout.js';

function createScenario(id: string, allowExternalLaunch?: boolean): IOnboardingTryoutScenario {
	return {
		id,
		trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
		presentation: { kind: 'command', payload: { commandId: 'test.command' } },
		tryout: {
			title: 'Try Example',
			description: 'Opens a safe example without changing user resources.',
			...(allowExternalLaunch === undefined ? {} : { allowExternalLaunch }),
		},
	};
}

suite('Onboarding tryout URL handler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHandler(options: {
		readonly scenarios?: readonly IOnboardingTryoutScenario[];
		readonly confirm?: (confirmation: IConfirmation) => Promise<IConfirmationResult>;
		readonly getAvailability?: (id: string) => OnboardingTryoutAvailability;
		readonly run?: (id: string) => Promise<void>;
	} = {}) {
		const scenarios = new Map((options.scenarios ?? [createScenario('test.tryout')]).map(scenario => [scenario.id, scenario]));
		const confirmations: IConfirmation[] = [];
		const information: { message: string; detail?: string }[] = [];
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const runs: { id: string; options?: IOnboardingTryoutRunOptions }[] = [];
		let focusCount = 0;
		let registeredHandler: IURLHandler | undefined;

		const urlService = upcastPartial<IURLService>({
			registerHandler: handler => {
				registeredHandler = handler;
				return toDisposable(() => {
					if (registeredHandler === handler) {
						registeredHandler = undefined;
					}
				});
			},
		});
		const tryoutService = upcastPartial<IOnboardingTryoutService>({
			getTryout: id => scenarios.get(id),
			getAvailability: id => options.getAvailability?.(id) ?? { kind: 'ready' },
			run: async (id, _token, runOptions) => {
				runs.push({ id, options: runOptions });
				await options.run?.(id);
				return { kind: 'opened' };
			},
		});
		const dialogService = upcastPartial<IDialogService>({
			confirm: async confirmation => {
				confirmations.push(confirmation);
				return options.confirm?.(confirmation) ?? { confirmed: true };
			},
			info: async (message, detail) => {
				information.push({ message, detail });
			},
		});
		const hostService = upcastPartial<IHostService>({
			focus: async () => {
				focusCount++;
			},
		});
		const productService = upcastPartial<IProductService>({
			urlProtocol: 'vscode',
			nameLong: 'Visual Studio Code',
		});
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (id: string, ...args: unknown[]) => {
				commands.push({ id, args });
				return undefined;
			},
		});
		const handler = disposables.add(new OnboardingTryoutUrlHandler(
			urlService,
			tryoutService,
			dialogService,
			hostService,
			productService,
			commandService,
			new TestNotificationService(),
			disposables.add(new NullLogService()),
		));

		return {
			handler,
			get registered() { return registeredHandler === handler; },
			confirmations,
			information,
			commands,
			runs,
			get focusCount() { return focusCount; },
		};
	}

	test('accepts only one strict product-protocol ID', () => {
		assert.deepStrictEqual([
			parseExternalOnboardingTryoutUri(URI.parse('vscode://tryout/test.tryout'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('VSCODE://TRYOUT/test.tryout'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('https://tryout/test.tryout'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('vscode://settings/test.tryout'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('vscode://tryout/test.tryout/extra'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('vscode://tryout/test.tryout?command=test.command'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('vscode://tryout/test.tryout#fragment'), 'vscode'),
			parseExternalOnboardingTryoutUri(URI.parse('vscode://tryout/../file'), 'vscode'),
		], [
			'test.tryout',
			'test.tryout',
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	test('allows external launch by default after confirmation', async () => {
		const harness = createHandler();

		const handled = await harness.handler.handleURL(URI.parse('vscode://tryout/test.tryout'));

		assert.deepStrictEqual({
			handled,
			registered: harness.registered,
			focusCount: harness.focusCount,
			confirmation: {
				type: harness.confirmations[0]?.type,
				message: harness.confirmations[0]?.message,
				detail: harness.confirmations[0]?.detail,
				primaryButton: harness.confirmations[0]?.primaryButton,
			},
			commands: harness.commands,
			runs: harness.runs,
			information: harness.information,
		}, {
			handled: true,
			registered: true,
			focusCount: 1,
			confirmation: {
				type: 'question',
				message: 'Open \'Try Example\'?',
				detail: 'An external link requested this feature example in Visual Studio Code.\n\nOpens a safe example without changing user resources.\n\nOnly continue if you initiated this request.',
				primaryButton: '&&Open Example',
			},
			commands: [],
			runs: [{ id: 'test.tryout', options: { source: 'externalLink' } }],
			information: [],
		});
	});

	test('does not run a cancelled external request', async () => {
		const harness = createHandler({
			confirm: async () => ({ confirmed: false }),
		});

		const handled = await harness.handler.handleURL(URI.parse('vscode://tryout/test.tryout'));

		assert.deepStrictEqual({
			handled,
			focusCount: harness.focusCount,
			confirmationCount: harness.confirmations.length,
			runs: harness.runs,
		}, {
			handled: true,
			focusCount: 1,
			confirmationCount: 1,
			runs: [],
		});
	});

	test('fails closed for opted-out, hidden, and unknown tryouts', async () => {
		const harness = createHandler({
			scenarios: [createScenario('test.private', false), createScenario('test.hidden')],
			getAvailability: id => id === 'test.hidden' ? { kind: 'hidden' } : { kind: 'ready' },
		});

		const optedOut = await harness.handler.handleURL(URI.parse('vscode://tryout/test.private'));
		const hidden = await harness.handler.handleURL(URI.parse('vscode://tryout/test.hidden'));
		const unknown = await harness.handler.handleURL(URI.parse('vscode://tryout/test.unknown'));

		assert.deepStrictEqual({
			optedOut,
			hidden,
			unknown,
			focusCount: harness.focusCount,
			confirmationCount: harness.confirmations.length,
			runs: harness.runs,
			information: harness.information,
		}, {
			optedOut: true,
			hidden: true,
			unknown: true,
			focusCount: 3,
			confirmationCount: 0,
			runs: [],
			information: [{
				message: 'Feature example unavailable',
				detail: 'This external link does not identify a feature example available in this version of Visual Studio Code.',
			}, {
				message: 'Feature example unavailable',
				detail: 'This external link does not identify a feature example available in this version of Visual Studio Code.',
			}, {
				message: 'Feature example unavailable',
				detail: 'This external link does not identify a feature example available in this version of Visual Studio Code.',
			}],
		});
	});

	test('suppresses concurrent external confirmations', async () => {
		const confirmationStarted = new DeferredPromise<void>();
		const confirmationResult = new DeferredPromise<IConfirmationResult>();
		const harness = createHandler({
			scenarios: [createScenario('test.first'), createScenario('test.second')],
			confirm: async () => {
				confirmationStarted.complete();
				return confirmationResult.p;
			},
		});

		const first = harness.handler.handleURL(URI.parse('vscode://tryout/test.first'));
		await confirmationStarted.p;
		const second = await harness.handler.handleURL(URI.parse('vscode://tryout/test.second'));
		confirmationResult.complete({ confirmed: false });
		const firstHandled = await first;

		assert.deepStrictEqual({
			firstHandled,
			second,
			focusCount: harness.focusCount,
			confirmationCount: harness.confirmations.length,
			runs: harness.runs,
		}, {
			firstHandled: true,
			second: true,
			focusCount: 1,
			confirmationCount: 1,
			runs: [],
		});
	});

	test('allows a new confirmation during an active tryout without clearing its guard when the first run ends', async () => {
		const firstRunStarted = new DeferredPromise<void>();
		const finishFirstRun = new DeferredPromise<void>();
		const secondConfirmationStarted = new DeferredPromise<void>();
		const secondConfirmationResult = new DeferredPromise<IConfirmationResult>();
		let confirmationCount = 0;
		const harness = createHandler({
			scenarios: [createScenario('test.first'), createScenario('test.second'), createScenario('test.third')],
			confirm: async () => {
				if (++confirmationCount === 1) {
					return { confirmed: true };
				}
				secondConfirmationStarted.complete();
				return secondConfirmationResult.p;
			},
			run: async id => {
				if (id === 'test.first') {
					firstRunStarted.complete();
					await finishFirstRun.p;
				}
			},
		});

		const first = harness.handler.handleURL(URI.parse('vscode://tryout/test.first'));
		await firstRunStarted.p;
		const second = harness.handler.handleURL(URI.parse('vscode://tryout/test.second'));
		await secondConfirmationStarted.p;
		finishFirstRun.complete();
		const firstHandled = await first;
		const thirdHandled = await harness.handler.handleURL(URI.parse('vscode://tryout/test.third'));
		secondConfirmationResult.complete({ confirmed: true });
		const secondHandled = await second;

		assert.deepStrictEqual({
			handled: [firstHandled, secondHandled, thirdHandled],
			focusCount: harness.focusCount,
			confirmationCount,
			runs: harness.runs,
		}, {
			handled: [true, true, true],
			focusCount: 2,
			confirmationCount: 2,
			runs: [
				{ id: 'test.first', options: { source: 'externalLink' } },
				{ id: 'test.second', options: { source: 'externalLink' } },
			],
		});
	});

	test('leaves unrelated URLs for other handlers', async () => {
		const harness = createHandler();

		const handled = await harness.handler.handleURL(URI.parse('vscode://settings/editor.wordWrap'));

		assert.deepStrictEqual({
			handled,
			focusCount: harness.focusCount,
			confirmationCount: harness.confirmations.length,
			runs: harness.runs,
		}, {
			handled: false,
			focusCount: 0,
			confirmationCount: 0,
			runs: [],
		});
	});
});
