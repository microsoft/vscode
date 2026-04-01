/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { State, UpdateType } from '../../../../../platform/update/common/update.js';
import { getAccountTitleBarState, IAccountTitleBarStateContext } from '../../browser/accountTitleBarState.js';

suite('Sessions - Account Title Bar State', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createState(overrides: Partial<IAccountTitleBarStateContext> = {}): IAccountTitleBarStateContext {
		return {
			isAccountLoading: false,
			accountName: 'lee@example.com',
			accountProviderLabel: 'GitHub',
			updateState: State.Idle(UpdateType.Setup),
			entitlement: ChatEntitlement.Pro,
			sentiment: {},
			quotas: {},
			...overrides,
		};
	}

	test('prefers update status over account and Copilot status', () => {
		const state = getAccountTitleBarState(createState({
			updateState: State.AvailableForDownload({ version: '1.0.0' }, false),
			entitlement: ChatEntitlement.Free,
			quotas: { chat: { total: 100, remaining: 10, percentRemaining: 10, overageEnabled: false, overageCount: 0, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			badge: state.badge,
			kind: state.kind,
		}, {
			source: 'update',
			label: 'New Update Available',
			badge: 'New',
			kind: 'prominent',
		});
	});

	test('shows low token badge for Copilot Free users', () => {
		const state = getAccountTitleBarState(createState({
			entitlement: ChatEntitlement.Free,
			quotas: { chat: { total: 100, remaining: 10, percentRemaining: 10, overageEnabled: false, overageCount: 0, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			badge: state.badge,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Tokens Remaining',
			badge: '10%',
			kind: 'warning',
		});
	});

	test('shows quota reached warning when free quota is exhausted', () => {
		const state = getAccountTitleBarState(createState({
			entitlement: ChatEntitlement.Free,
			quotas: { completions: { total: 100, remaining: 0, percentRemaining: 0, overageEnabled: false, overageCount: 0, unlimited: false } },
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Quota Reached',
			kind: 'warning',
		});
	});

	test('falls back to signed-in account label when no higher-priority state exists', () => {
		const state = getAccountTitleBarState(createState());

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
			revealLabelOnHover: state.revealLabelOnHover,
		}, {
			source: 'account',
			label: 'lee@example.com',
			kind: 'default',
			revealLabelOnHover: true,
		});
	});

	test('reveals loading account label only on hover', () => {
		const state = getAccountTitleBarState(createState({
			isAccountLoading: true,
			accountName: undefined,
			accountProviderLabel: undefined,
			entitlement: ChatEntitlement.Unknown,
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
			revealLabelOnHover: state.revealLabelOnHover,
		}, {
			source: 'account',
			label: 'Loading Account...',
			kind: 'default',
			revealLabelOnHover: true,
		});
	});

	test('keeps status labels visible when they are not profile names', () => {
		const state = getAccountTitleBarState(createState({
			updateState: State.Ready({ version: '1.0.0' }, true, false),
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			revealLabelOnHover: state.revealLabelOnHover,
		}, {
			source: 'update',
			label: 'Restart to Update',
			revealLabelOnHover: undefined,
		});
	});

	test('shows sign in state when no account is available', () => {
		const state = getAccountTitleBarState(createState({
			accountName: undefined,
			accountProviderLabel: undefined,
			entitlement: ChatEntitlement.Unknown,
		}));

		assert.deepStrictEqual({
			source: state.source,
			label: state.label,
			kind: state.kind,
		}, {
			source: 'copilot',
			label: 'Copilot Signed Out',
			kind: 'prominent',
		});
	});
});
