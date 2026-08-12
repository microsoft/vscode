/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDefaultAccountService, IManagedSettingsCompatibilityError } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
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

	private _managedSettingsCompatibilityError: IManagedSettingsCompatibilityError | null = null;
	override get managedSettingsCompatibilityError(): IManagedSettingsCompatibilityError | null { return this._managedSettingsCompatibilityError; }

	private readonly _onDidChangeManagedSettingsCompatibilityError = new Emitter<IManagedSettingsCompatibilityError | null>();
	override readonly onDidChangeManagedSettingsCompatibilityError = this._onDidChangeManagedSettingsCompatibilityError.event;

	setManagedSettingsCompatibilityError(error: IManagedSettingsCompatibilityError | null): void {
		this._managedSettingsCompatibilityError = error;
		this._onDidChangeManagedSettingsCompatibilityError.fire(error);
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

class RecordingNotificationService extends TestNotificationService {
	readonly messages: string[] = [];

	override prompt(...args: Parameters<TestNotificationService['prompt']>): ReturnType<TestNotificationService['prompt']> {
		this.messages.push(args[1]);
		return super.prompt(...args);
	}
}

suite('AccountPolicyGateContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('composes account gate and managed settings compatibility into the standard hidden state', () => {
		const gateService = disposables.add(new TestAccountPolicyGateService());
		const defaultAccountService = disposables.add(new TestDefaultAccountService());
		const chatEntitlementService = new TestChatEntitlementService();
		const contextKeyService = new MockContextKeyService();
		const storageService = disposables.add(new InMemoryStorageService());
		const notificationService = new RecordingNotificationService();
		const productService = new class extends mock<IProductService>() {
			override readonly nameShort = 'Code';
		}();

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			contextKeyService,
			chatEntitlementService,
			defaultAccountService,
			new NullLogService(),
			notificationService,
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
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError(null);
		captureState();
		gateService.setGateInfo({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved,
		});
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError({ errorCode: 'client_update_required' });
		captureState();
		gateService.setGateInfo({ state: AccountPolicyGateState.Inactive });
		captureState();
		defaultAccountService.setManagedSettingsCompatibilityError(null);
		captureState();

		assert.deepStrictEqual({
			states,
			forceHiddenValues: chatEntitlementService.forceHiddenValues,
			compatibilityMessage: notificationService.messages[0],
			fallbackCompatibilityMessage: notificationService.messages[2],
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
			compatibilityMessage: 'Your version of Code cannot enforce your organization\'s managed settings. Update Code to version 1.135.0 or later to continue using AI features.',
			fallbackCompatibilityMessage: 'Your version of Code cannot enforce your organization\'s managed settings. Update Code to continue using AI features.',
		});
	});
});
