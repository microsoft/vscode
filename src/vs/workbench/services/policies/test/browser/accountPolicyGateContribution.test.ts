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
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../common/accountPolicyService.js';

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
	private forceHidden: boolean | undefined;

	override setForceHidden(hidden: boolean): void {
		if (this.forceHidden !== hidden) {
			this.forceHidden = hidden;
			this.forceHiddenValues.push(hidden);
		}
	}
}

suite('AccountPolicyGateContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('composes account gate and managed settings compatibility into the standard hidden state', () => {
		const gateService = disposables.add(new TestAccountPolicyGateService());
		const defaultAccountService = disposables.add(new TestDefaultAccountService());
		const chatEntitlementService = new TestChatEntitlementService();
		const storageService = disposables.add(new InMemoryStorageService());
		const productService = new class extends mock<IProductService>() {
			override readonly nameShort = 'Code';
		}();

		disposables.add(new AccountPolicyGateContribution(
			gateService,
			new MockContextKeyService(),
			chatEntitlementService,
			defaultAccountService,
			new NullLogService(),
			new TestNotificationService(),
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			productService,
			storageService,
			NullTelemetryService,
		));

		defaultAccountService.setManagedSettingsCompatibilityError({ errorCode: 'client_update_required' });
		defaultAccountService.setManagedSettingsCompatibilityError(null);
		gateService.setGateInfo({
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved,
		});
		defaultAccountService.setManagedSettingsCompatibilityError({ errorCode: 'client_update_required' });
		gateService.setGateInfo({ state: AccountPolicyGateState.Inactive });
		defaultAccountService.setManagedSettingsCompatibilityError(null);

		assert.deepStrictEqual(chatEntitlementService.forceHiddenValues, [false, true, false, true, false]);
	});
});
