/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressService, IProgressStep, IProgressWindowOptions } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, IChatEntitlementContextState } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatSetupController } from '../../browser/chatSetup/chatSetupController.js';
import { gitHubEnterpriseUrisSetting } from '../../../../services/accounts/common/githubEnterprise.js';

suite('ChatSetupController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createEnrollmentController(values: Record<string, unknown>) {
		const configuration = new TestConfigurationService({ ...values });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const write = sinon.stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		const input = sinon.stub<Parameters<IQuickInputService['input']>, ReturnType<IQuickInputService['input']>>().resolves(undefined);
		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		const existing = new Set(registry.getConfigurations());
		disposables.add(toDisposable(() => registry.deregisterConfigurations(registry.getConfigurations().filter(node => !existing.has(node)))));
		const controller = disposables.add(new ChatSetupController(
			new class extends mock<ChatEntitlementContext>() { override readonly onDidChange = Event.None; }(),
			new class extends mock<ChatEntitlementRequests>() { }(),
			new NullTelemetryServiceShape(),
			new class extends mock<IExtensionsWorkbenchService>() { }(),
			new NullLogService(),
			new class extends mock<IProgressService>() { }(),
			new class extends mock<IActivityService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IDialogService>() { }(),
			configuration,
			new class extends mock<ILifecycleService>() { }(),
			new class extends mock<IQuickInputService>() { override input = input; }(),
			new class extends mock<IDefaultAccountService>() { }(),
			new class extends mock<IProductService>() { }(),
			new class extends mock<IWorkspaceTrustManagementService>() { override isWorkspaceTrusted() { return true; } }(),
		));
		const setup = sinon.stub(controller, 'setup').resolves(true);
		return { controller, configuration, write, input, setup };
	}

	for (const values of [
		{ 'github-enterprise.uri': 'not-a-url' },
		{ [gitHubEnterpriseUrisSetting]: ['not-a-url'] },
		{ [gitHubEnterpriseUrisSetting]: ['https://valid.ghe.com', 'not-a-url'] },
	]) {
		test(`corrects invalid enterprise enrollment (${JSON.stringify(values)})`, async () => {
			const { controller, configuration, input, setup } = createEnrollmentController(values);
			input.resolves('https://corrected.ghe.com');
			await controller.setupWithProvider({ useEnterpriseProvider: true });
			const serverValidation = await input.firstCall.args[0]?.validateInput?.('https://github.example.com');
			assert.deepStrictEqual({
				prompts: input.getCalls().map(call => call.args[0]?.value),
				validation: await input.firstCall.args[0]?.validateInput?.('https://corrected.ghe.com'),
				rejectsServer: typeof serverValidation === 'object' && serverValidation !== null && serverValidation.severity === Severity.Error,
				hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
				setupCalls: setup.callCount
			}, {
				prompts: ['not-a-url'],
				validation: undefined,
				rejectsServer: true,
				hosts: [...(values[gitHubEnterpriseUrisSetting] ?? []).filter(uri => uri !== 'not-a-url'), 'https://corrected.ghe.com'],
				setupCalls: 1
			});
		});
	}

	test('cancelling enterprise correction leaves configuration and authentication unchanged', async () => {
		const values = { [gitHubEnterpriseUrisSetting]: ['https://valid.ghe.com', 'not-a-url'] };
		const { controller, configuration, input, write, setup } = createEnrollmentController(values);
		const result = await controller.setupWithProvider({ useEnterpriseProvider: true });
		assert.deepStrictEqual({
			result,
			prompts: input.getCalls().map(call => call.args[0]?.value),
			hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
			writes: write.callCount,
			setupCalls: setup.callCount
		}, { result: undefined, prompts: ['not-a-url'], hosts: values[gitHubEnterpriseUrisSetting], writes: 0, setupCalls: 0 });
	});

	test('corrects every invalid entry before starting enterprise authentication', async () => {
		const { controller, configuration, input, setup } = createEnrollmentController({
			[gitHubEnterpriseUrisSetting]: ['first invalid', 'https://valid.ghe.com', 'second invalid']
		});
		input.onFirstCall().resolves('https://first.ghe.com');
		input.onSecondCall().resolves('https://second.ghe.com');
		await controller.setupWithProvider({ useEnterpriseProvider: true });
		assert.deepStrictEqual({
			prompts: input.getCalls().map(call => call.args[0]?.value),
			hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
			setupCalls: setup.callCount
		}, {
			prompts: ['first invalid', 'second invalid'],
			hosts: ['https://valid.ghe.com', 'https://first.ghe.com', 'https://second.ghe.com'],
			setupCalls: 1
		});
	});

	test('valid cloud and server instances do not prompt for correction', async () => {
		const hosts = ['https://valid.ghe.com', 'http://ghe.local:8080/Team'];
		const { controller, configuration, input, setup } = createEnrollmentController({ [gitHubEnterpriseUrisSetting]: hosts });
		await controller.setupWithProvider({ useEnterpriseProvider: true });
		assert.deepStrictEqual({
			hosts: configuration.getValue(gitHubEnterpriseUrisSetting),
			prompts: input.callCount,
			setupCalls: setup.callCount
		}, { hosts, prompts: 0, setupCalls: 1 });
	});

	test('cancels while waiting for browser sign-in', async () => {
		const signInStarted = new DeferredPromise<void>();
		const pendingSignIn = new DeferredPromise<Awaited<ReturnType<ChatEntitlementRequests['signIn']>>>();
		const context = new class extends mock<ChatEntitlementContext>() {
			override readonly onDidChange = Event.None;
			override get state(): IChatEntitlementContextState {
				return {
					entitlement: ChatEntitlement.Unknown,
					sku: undefined,
					organisations: undefined,
					isStaff: undefined,
					copilotTrackingId: undefined,
				};
			}
			override suspend(): void { }
			override resume(): void { }
		}();
		const requests = new class extends mock<ChatEntitlementRequests>() {
			override signIn(): Promise<Awaited<ReturnType<ChatEntitlementRequests['signIn']>>> {
				signInStarted.complete();
				return pendingSignIn.p;
			}
		}();
		const extensionsWorkbenchService = new class extends mock<IExtensionsWorkbenchService>() {
			override get local() { return []; }
		}();
		const progressService = new class extends mock<IProgressService>() {
			override withProgress<R>(
				_options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
				task: (progress: IProgress<IProgressStep>) => Promise<R>
			): Promise<R> {
				return task({ report() { } });
			}
		}();
		const activityService = new class extends mock<IActivityService>() {
			override showViewContainerActivity() { return Disposable.None; }
		}();
		const cancellation = disposables.add(new CancellationTokenSource());
		const controller = disposables.add(new ChatSetupController(
			context,
			requests,
			new NullTelemetryServiceShape(),
			extensionsWorkbenchService,
			new NullLogService(),
			progressService,
			activityService,
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IConfigurationService>() { }(),
			new class extends mock<ILifecycleService>() { }(),
			new class extends mock<IQuickInputService>() { }(),
			new class extends mock<IDefaultAccountService>() { }(),
			new class extends mock<IProductService>() { }(),
			new class extends mock<IWorkspaceTrustManagementService>() { }(),
		));

		const resultPromise = controller.setup({ forceSignIn: true, cancellationToken: cancellation.token });
		await signInStarted.p;
		cancellation.cancel();
		const result = await resultPromise;
		pendingSignIn.complete({});

		assert.strictEqual(result, undefined);
	});
});
