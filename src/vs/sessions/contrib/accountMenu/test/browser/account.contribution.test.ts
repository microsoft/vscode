/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { showSessionsWelcomeAfterSignOut } from '../../browser/account.contribution.js';

suite('Sessions - Account Contribution', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows welcome after sign out once entitlement becomes unknown', async () => {
		const order: string[] = [];
		const entitlementChangeEmitter = disposables.add(new Emitter<void>());
		let entitlement = ChatEntitlement.Free;

		const chatEntitlementService: Pick<IChatEntitlementService, 'entitlement' | 'onDidChangeEntitlement'> = {
			get entitlement() {
				return entitlement;
			},
			onDidChangeEntitlement: entitlementChangeEmitter.event,
		};
		const showWelcomePromise = showSessionsWelcomeAfterSignOut(chatEntitlementService, () => order.push('resetWelcome'));
		order.push('signOut');
		entitlement = ChatEntitlement.Unknown;
		entitlementChangeEmitter.fire();
		order.push('entitlementChanged');
		await showWelcomePromise;

		assert.deepStrictEqual(order, [
			'signOut',
			'entitlementChanged',
			'resetWelcome',
		]);
	});

	test('shows welcome immediately when entitlement is already unknown', async () => {
		const order: string[] = [];
		const chatEntitlementService: Pick<IChatEntitlementService, 'entitlement' | 'onDidChangeEntitlement'> = {
			entitlement: ChatEntitlement.Unknown,
			onDidChangeEntitlement: disposables.add(new Emitter<void>()).event,
		};
		await showSessionsWelcomeAfterSignOut(chatEntitlementService, () => order.push('resetWelcome'));

		assert.deepStrictEqual(order, ['resetWelcome']);
	});

	test('handles entitlement becoming unknown while the listener is being attached', async () => {
		const order: string[] = [];
		let entitlement = ChatEntitlement.Free;
		const onDidChangeEntitlement: IChatEntitlementService['onDidChangeEntitlement'] = listener => {
			entitlement = ChatEntitlement.Unknown;
			listener();
			return { dispose() { } };
		};
		const chatEntitlementService: Pick<IChatEntitlementService, 'entitlement' | 'onDidChangeEntitlement'> = {
			get entitlement() {
				return entitlement;
			},
			onDidChangeEntitlement,
		};
		await showSessionsWelcomeAfterSignOut(chatEntitlementService, () => order.push('resetWelcome'));

		assert.deepStrictEqual(order, ['resetWelcome']);
	});
});
