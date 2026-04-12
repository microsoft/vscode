/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatEntitlement } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { getAccountTitleBarBadgeKey, getAccountTitleBarState } from '../../browser/accountTitleBarState.js';
suite('Sessions - Account Title Bar State', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function createState(overrides = {}) {
        return {
            isAccountLoading: false,
            accountName: 'lee@example.com',
            accountProviderLabel: 'GitHub',
            entitlement: ChatEntitlement.Pro,
            sentiment: {},
            quotas: {},
            ...overrides,
        };
    }
    test('shows low token badge for Copilot Free users', () => {
        const state = getAccountTitleBarState(createState({
            entitlement: ChatEntitlement.Free,
            quotas: { chat: { total: 100, remaining: 10, percentRemaining: 10, overageEnabled: false, overageCount: 0, unlimited: false } },
        }));
        assert.deepStrictEqual({
            source: state.source,
            label: state.label,
            badge: state.badge,
            dotBadge: state.dotBadge,
            kind: state.kind,
        }, {
            source: 'copilot',
            label: 'Tokens Remaining',
            badge: '10%',
            dotBadge: 'error',
            kind: 'warning',
        });
        assert.strictEqual(getAccountTitleBarBadgeKey(state), 'copilot:error:10%');
    });
    test('shows warning dot badge for low but non-critical tokens', () => {
        const state = getAccountTitleBarState(createState({
            entitlement: ChatEntitlement.Free,
            quotas: { chat: { total: 100, remaining: 20, percentRemaining: 20, overageEnabled: false, overageCount: 0, unlimited: false } },
        }));
        assert.deepStrictEqual({
            source: state.source,
            label: state.label,
            badge: state.badge,
            dotBadge: state.dotBadge,
            kind: state.kind,
        }, {
            source: 'copilot',
            label: 'Tokens Remaining',
            badge: '20%',
            dotBadge: 'warning',
            kind: 'accent',
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
            dotBadge: state.dotBadge,
            kind: state.kind,
        }, {
            source: 'copilot',
            label: 'Quota Reached',
            dotBadge: 'error',
            kind: 'warning',
        });
        assert.strictEqual(getAccountTitleBarBadgeKey(state), 'copilot:error:');
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
            label: 'Agents Signed Out',
            kind: 'prominent',
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWNjb3VudFRpdGxlQmFyU3RhdGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvYWNjb3VudE1lbnUvdGVzdC9icm93c2VyL2FjY291bnRUaXRsZUJhclN0YXRlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUMxRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsdUJBQXVCLEVBQWdDLE1BQU0sdUNBQXVDLENBQUM7QUFFMUksS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtJQUVoRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsV0FBVyxDQUFDLFlBQW1ELEVBQUU7UUFDekUsT0FBTztZQUNOLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsV0FBVyxFQUFFLGlCQUFpQjtZQUM5QixvQkFBb0IsRUFBRSxRQUFRO1lBQzlCLFdBQVcsRUFBRSxlQUFlLENBQUMsR0FBRztZQUNoQyxTQUFTLEVBQUUsRUFBRTtZQUNiLE1BQU0sRUFBRSxFQUFFO1lBQ1YsR0FBRyxTQUFTO1NBQ1osQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1FBQ3pELE1BQU0sS0FBSyxHQUFHLHVCQUF1QixDQUFDLFdBQVcsQ0FBQztZQUNqRCxXQUFXLEVBQUUsZUFBZSxDQUFDLElBQUk7WUFDakMsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsRUFBRSxFQUFFLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxjQUFj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