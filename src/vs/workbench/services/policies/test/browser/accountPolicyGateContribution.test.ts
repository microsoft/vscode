/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDefaultAccountRefreshOptions, IDefaultAccountService, IManagedSettingsCompatibilityError } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Severity } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IManagedSettingsFreshness, ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { AccountPolicyGateContribution } from '../../browser/accountPolicyGateContribution.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, ChatAccountPolicyGateActiveContext, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../common/accountPolicyService.js';

class TestAccountPolicyGateService extends mock<IAccountPolicyGateService>() {
	private _gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
	override get gateInfo(): IAccountPolicyGateInfo { return this._gateInfo; }

	private readonly _onDidChangeGateInfo = new Emitter<IAccountPolicyGateInfo>();
	override readonly onDidChangeGateInfo = this._onDidChangeGateInfo.event;

	constructor(initial?: IAccountPolicyGateInfo) {
		super();
		if (initial) {
			this._gateInfo = initial;
		}
	}

	setGateInfo(info: IAccountPolicyGateInfo): void {
		this._gateInfo = info;
		this._onDidChangeGateInfo.fire(info);
	}

	dispose(): void {
		this._onDidChangeGateInfo.dispose();
	}
}

class TestDefaultAccountService extends mock<IDefaultAccountService>() {
	override readonly currentDefaultAccount = null;
	readonly refreshOptions: (IDefaultAccountRefreshOptions | undefined)[] = [];

	private _managedSettingsCompatibilityError: IManagedSettingsCompatibilityError | null = null;
	override get managedSettingsCompatibilityError(): IManagedSettingsCompatibilityError | null { return this._managedSettingsCompatibilityError; }

	private readonly _onDidChangeManagedSettingsCompatibilityError = new Emitter<IManagedSettingsCompatibilityError | null>();
	override readonly onDidChangeManagedSettingsCompatibilityError = this._onDidChangeManagedSettingsCompatibilityError.event;

	setManagedSettingsCompatibilityError(error: IManagedSettingsCompatibilityError | null): void {
		this._managedSettingsCompatibilityError = error;
		this._onDidChangeManagedSettingsCompatibilityError.fire(error);
	}

	override async refresh(options?: IDefaultAccountRefreshOptions): Promise<null> {
		this.refreshOptions.push(options);
		return null;
	}

	dispose(): void {
		this._onDidChangeManagedSettingsCompatibilityError.dispose();
	}
}

class TestChatEntitlementService extends mock<IChatEntitlementService>() {
	readonly forceHiddenValues: boolean[] = [];
	forceHidden: boolean | undefined;

	override setForceHidden(hidden: boolean): void {
		if (this.forceHidden !== hidden) {
			this.forceHidden = hidden;
			this.forceHiddenValues.push(hidden);
		}
	}
}

suite('AccountPolicyGateContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('composes account gate and managed settings compatibility into the standard hidden state', async () => {
		const gateService = disposables.add(new TestAccountPolicyGateService());
		const defaultAccountService = disposables.add(new TestDefaultAccountService());
		const chatEntitlementService = new TestChatEntitlementService();
		const contextKeyService = new MockContextKeyService();
		const storageService = disposables.add(new InMemoryStorageService());
		const dialogService = new TestDialogService();
		const promptStub = sinon.stub(dialogService, 'prompt').resolves({});
		const productService = new class extends mock<IProductService>() {
			override readonly nameShort = 'Code';
		}();

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			contextKeyService,
			chatEntitlementService,
			defaultAccountService,
			new NullLogService(),
			new TestNotificationService(),
			dialogService,
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			productService,
			storageService,
			NullTelemetryService,
		));

		const states: { context: boolean | undefined; hidden: boolean | undefined }[] = [];
		const captureState = () => states.push({
			context: ChatAccountPolicyGateActiveContext.getValue(contextKeyService),
			hidden: chatEntitlementService.forceHidden,
		});

		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError({
			errorCode: 'client_update_required',
			minimumClientVersion: '1.135.0',
		});
		await Promise.resolve();
		await Promise.resolve();
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError(null);
		captureState();
		gateService.setGateInfo({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved,
		});
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError({ errorCode: 'client_update_required' });
		await Promise.resolve();
		await Promise.resolve();
		captureState();
		gateService.setGateInfo({ state: AccountPolicyGateState.Inactive });
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError(null);
		captureState();

		const compatibilityDialog = promptStub.firstCall.args[0];
		const fallbackCompatibilityDialog = promptStub.secondCall.args[0];
		assert.deepStrictEqual({
			states,
			forceHiddenValues: chatEntitlementService.forceHiddenValues,
			compatibilityDialog: {
				title: compatibilityDialog.title,
				message: compatibilityDialog.message,
				custom: compatibilityDialog.custom,
				buttons: compatibilityDialog.buttons?.map(button => button.label),
				cancelButton: compatibilityDialog.cancelButton,
			},
			fallbackCompatibilityMessage: fallbackCompatibilityDialog.message,
		}, {
			states: [
				{ context: false, hidden: false },
				{ context: true, hidden: true },
				{ context: false, hidden: false },
				{ context: true, hidden: true },
				{ context: true, hidden: true },
				{ context: true, hidden: true },
				{ context: false, hidden: false },
			],
			forceHiddenValues: [false, true, false, true, false],
			compatibilityDialog: {
				title: 'Update Required',
				message: 'Your version of Code cannot enforce your organization\'s managed settings. Update Code to version 1.135.0 or later to continue using AI features.',
				custom: true,
				buttons: ['Check for Updates', 'Learn More'],
				cancelButton: 'Close',
			},
			fallbackCompatibilityMessage: 'Your version of Code cannot enforce your organization\'s managed settings. Update Code to continue using AI features.',
		});
	});

	test('shows policy resolution notification only after freshness remains pending for five seconds', async () => {
		const clock = sinon.useFakeTimers();
		const gateService = disposables.add(new TestAccountPolicyGateService({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: {
				state: ManagedSettingsFreshnessState.Pending,
				source: 'server',
			},
		}));
		const notificationService = new TestNotificationService();
		const notificationPromptSpy = sinon.spy(notificationService, 'prompt');

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			new MockContextKeyService(),
			new TestChatEntitlementService(),
			disposables.add(new TestDefaultAccountService()),
			new NullLogService(),
			notificationService,
			new TestDialogService(),
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IProductService>() { override readonly nameShort = 'Code'; }(),
			disposables.add(new InMemoryStorageService()),
			NullTelemetryService,
		));

		assert.strictEqual(notificationPromptSpy.callCount, 0);
		await clock.tickAsync(4999);
		assert.strictEqual(notificationPromptSpy.callCount, 0);
		await clock.tickAsync(1);
		const pendingNotification = notificationPromptSpy.firstCall;

		gateService.setGateInfo({ state: AccountPolicyGateState.Satisfied });
		gateService.setGateInfo({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: {
				state: ManagedSettingsFreshnessState.Pending,
				source: 'server',
			},
		});
		await clock.tickAsync(4999);
		gateService.setGateInfo({ state: AccountPolicyGateState.Satisfied });
		await clock.tickAsync(1);

		assert.deepStrictEqual({
			callCount: notificationPromptSpy.callCount,
			severity: pendingNotification.args[0],
			message: pendingNotification.args[1],
			actions: pendingNotification.args[2],
			options: pendingNotification.args[3],
		}, {
			callCount: 1,
			severity: Severity.Info,
			message: 'Code is resolving your organization\'s policy. AI features will remain unavailable until this completes.',
			actions: [],
			options: { sticky: true },
		});
	});

	test('shows one failure-specific dialog for each blocked freshness episode', async () => {
		const gateService = disposables.add(new TestAccountPolicyGateService());
		const defaultAccountService = disposables.add(new TestDefaultAccountService());
		const dialogService = new TestDialogService();
		const promptStub = sinon.stub(dialogService, 'prompt').resolves({});
		const notificationService = new TestNotificationService();
		const notificationPromptSpy = sinon.spy(notificationService, 'prompt');

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			new MockContextKeyService(),
			new TestChatEntitlementService(),
			defaultAccountService,
			new NullLogService(),
			notificationService,
			dialogService,
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IProductService>() { override readonly nameShort = 'Code'; }(),
			disposables.add(new InMemoryStorageService()),
			NullTelemetryService,
		));

		const blockedStates = [
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.NoToken },
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.NoUrl },
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.RateLimited },
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.HttpError, httpStatus: 500 },
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.Malformed },
			{ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.Network },
		] satisfies readonly Extract<IManagedSettingsFreshness, { state: ManagedSettingsFreshnessState.Blocked }>[];

		for (const managedSettingsFreshness of blockedStates) {
			const info: IAccountPolicyGateInfo = {
				state: AccountPolicyGateState.Restricted,
				reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
				managedSettingsFreshness,
			};
			gateService.setGateInfo(info);
			gateService.setGateInfo(info);
			await Promise.resolve();
			await Promise.resolve();
			gateService.setGateInfo({
				state: AccountPolicyGateState.Restricted,
				reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
				managedSettingsFreshness: {
					state: ManagedSettingsFreshnessState.Pending,
					source: 'server',
				},
			});
			gateService.setGateInfo(info);
			await Promise.resolve();
			await Promise.resolve();
		}

		const retryResult = promptStub.getCall(5).args[0].buttons?.[0].run({});
		gateService.setGateInfo({ state: AccountPolicyGateState.Satisfied });
		gateService.setGateInfo({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: blockedStates[0],
		});
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			dialogs: promptStub.getCalls().map(call => ({
				title: call.args[0].title,
				buttons: call.args[0].buttons?.map(button => button.label),
			})),
			notificationCount: notificationPromptSpy.callCount,
			retryOptions: defaultAccountService.refreshOptions,
			retryResult,
		}, {
			dialogs: [
				{
					title: 'Managed Settings Unavailable',
					buttons: ['Sign In'],
				},
				{
					title: 'Managed Settings Unavailable',
					buttons: [],
				},
				{
					title: 'Managed Settings Unavailable',
					buttons: ['Retry'],
				},
				{
					title: 'Managed Settings Unavailable',
					buttons: ['Retry'],
				},
				{
					title: 'Invalid Managed Settings',
					buttons: ['Retry'],
				},
				{
					title: 'Managed Settings Unavailable',
					buttons: ['Retry'],
				},
				{
					title: 'Managed Settings Unavailable',
					buttons: ['Sign In'],
				},
			],
			notificationCount: 0,
			retryOptions: [{ forceRefresh: true, retryManagedSettings: true }],
			retryResult: undefined,
		});
		assert.match(promptStub.getCall(5).args[0].message, /requires Code to refresh managed settings whenever it starts or reloads\.\n\nAn error prevented the required policy/);
	});

	test('uses the compatibility dialog for update-required freshness without duplication', async () => {
		const gateService = disposables.add(new TestAccountPolicyGateService());
		const defaultAccountService = disposables.add(new TestDefaultAccountService());
		const dialogService = new TestDialogService();
		const promptStub = sinon.stub(dialogService, 'prompt').resolves({});

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			new MockContextKeyService(),
			new TestChatEntitlementService(),
			defaultAccountService,
			new NullLogService(),
			new TestNotificationService(),
			dialogService,
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<IProductService>() { override readonly nameShort = 'Code'; }(),
			disposables.add(new InMemoryStorageService()),
			NullTelemetryService,
		));

		const updateRequiredInfo: IAccountPolicyGateInfo = {
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.UpdateRequired,
			},
		};
		gateService.setGateInfo(updateRequiredInfo);
		gateService.setGateInfo(updateRequiredInfo);
		assert.strictEqual(promptStub.callCount, 0);

		defaultAccountService.setManagedSettingsCompatibilityError({
			errorCode: 'client_update_required',
			minimumClientVersion: '1.135.0',
		});
		defaultAccountService.setManagedSettingsCompatibilityError({
			errorCode: 'client_update_required',
			minimumClientVersion: '1.135.0',
		});
		await Promise.resolve();
		await Promise.resolve();

		const dialog = promptStub.firstCall.args[0];
		assert.deepStrictEqual({
			callCount: promptStub.callCount,
			title: dialog.title,
			message: dialog.message,
			buttons: dialog.buttons?.map(button => button.label),
			cancelButton: dialog.cancelButton,
		}, {
			callCount: 1,
			title: 'Update Required',
			message: 'Your version of Code cannot enforce your organization\'s managed settings. Update Code to version 1.135.0 or later to continue using AI features.',
			buttons: ['Check for Updates', 'Learn More'],
			cancelButton: 'Close',
		});
	});
});
