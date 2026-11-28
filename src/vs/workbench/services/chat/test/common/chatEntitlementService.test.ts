/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../authentication/common/authentication.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, chatRequiresSetup, IChatEntitlementContextState, IChatSetupRequirement } from '../../common/chatEntitlementService.js';

suite('chatRequiresSetup', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function context(overrides: Partial<IChatSetupRequirement> = {}): IChatSetupRequirement {
		return {
			completed: true,
			disabled: false,
			untrusted: false,
			entitlement: ChatEntitlement.Pro,
			anonymous: false,
			hasByokModels: false,
			...overrides,
		};
	}

	test('a completed, signed-up user does not require setup', () => {
		assert.strictEqual(chatRequiresSetup(context()), false);
	});

	test('not completed requires setup', () => {
		assert.strictEqual(chatRequiresSetup(context({ completed: false })), true);
	});

	test('not completed but BYOK models present does not require setup', () => {
		assert.strictEqual(chatRequiresSetup(context({ completed: false, hasByokModels: true })), false);
	});

	test('disabled requires setup', () => {
		assert.strictEqual(chatRequiresSetup(context({ disabled: true })), true);
	});

	test('untrusted requires setup', () => {
		assert.strictEqual(chatRequiresSetup(context({ untrusted: true })), true);
	});

	test('entitlement Available requires setup (sign up)', () => {
		assert.strictEqual(chatRequiresSetup(context({ entitlement: ChatEntitlement.Available })), true);
	});

	test('signed out (Unknown) requires setup', () => {
		// completed: true so the result is driven by the Unknown entitlement, not the "not completed" clause.
		assert.strictEqual(chatRequiresSetup(context({ completed: true, entitlement: ChatEntitlement.Unknown })), true);
	});

	test('signed out but anonymous access enabled does not require setup', () => {
		// Anonymous excepts the "signed out" entitlement clause; the completed
		// clause is satisfied because opting into anonymous completes setup.
		assert.strictEqual(chatRequiresSetup(context({ completed: true, entitlement: ChatEntitlement.Unknown, anonymous: true })), false);
	});

	test('signed out but BYOK models present does not require setup', () => {
		assert.strictEqual(chatRequiresSetup(context({ completed: false, entitlement: ChatEntitlement.Unknown, hasByokModels: true })), false);
	});
});

suite('ChatEntitlementRequests sign in', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards the scope options to the default account sign-in', async () => {
		const signIns: Parameters<IDefaultAccountService['signIn']>[0][] = [];
		const requests = disposables.add(new ChatEntitlementRequests(
			new class extends mock<ChatEntitlementContext>() {
				override get state(): IChatEntitlementContextState {
					return { entitlement: ChatEntitlement.Unknown, sku: undefined, organisations: undefined, isStaff: undefined, copilotTrackingId: undefined };
				}
				override readonly onDidChange = Event.None;
				override async update() { }
			}(),
			{ clearQuotas() { }, acceptQuotas() { } },
			NullTelemetryService,
			new NullLogService(),
			new class extends mock<IRequestService>() { }(),
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<ILifecycleService>() { }(),
			new class extends mock<IDefaultAccountService>() {
				override readonly onDidChangeDefaultAccount = Event.None;
				override async getDefaultAccount() { return null; }
				override async signIn(options?: Parameters<IDefaultAccountService['signIn']>[0]) {
					signIns.push(options);
					return null;
				}
			}(),
			new class extends mock<IAuthenticationService>() { }(),
			disposables.add(new InMemoryStorageService()),
		));

		await requests.signIn({ additionalScopes: ['read:user', 'user:email'], keepMinimalSignIn: true });

		assert.deepStrictEqual(signIns, [{
			additionalScopes: ['read:user', 'user:email'],
			keepMinimalSignIn: true,
			extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
			provider: undefined,
		}]);
	});
});
