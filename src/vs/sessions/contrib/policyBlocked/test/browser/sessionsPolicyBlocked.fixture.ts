/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { Event } from '../../../../../base/common/event.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsBlockedOverlayOptions, SessionsBlockedReason, SessionsPolicyBlockedOverlay } from '../../browser/sessionsPolicyBlocked.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';

const supportUrl = 'https://example.com/copilot-help';

function createOverlay(ctx: ComponentFixtureContext, options: ISessionsBlockedOverlayOptions): void {
	ctx.container.style.width = '600px';
	ctx.container.style.height = '400px';
	ctx.container.style.position = 'relative';

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly nameShort = 'Code - OSS';
				override readonly quality = 'insider';
				override readonly urlProtocol = 'vscode-insiders';
			}());
			reg.definePartialInstance(IWorkbenchLayoutService, { mainContainer: ctx.container, onDidLayoutMainContainer: Event.None });
			reg.definePartialInstance(ISessionsPartService, { focusNewSessionSlot: () => { } });
			reg.definePartialInstance(ISessionsService, { focusActiveSession: () => { } });
		},
	});

	ctx.disposableStore.add(instantiationService.createInstance(SessionsPolicyBlockedOverlay, ctx.container, options));
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	PolicyBlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, { reason: SessionsBlockedReason.AgentDisabled }),
	}),
	PolicyBlockedWithSupport: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, { reason: SessionsBlockedReason.AgentDisabled, supportUrl }),
	}),
	Loading: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, { reason: SessionsBlockedReason.Loading }),
	}),
	AccountPolicyGate: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, {
			reason: SessionsBlockedReason.AccountPolicyGate,
			accountName: 'octocat',
			approvedOrganizations: ['github', 'microsoft'],
		}),
	}),
	AccountPolicyGateWithSupport: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, {
			reason: SessionsBlockedReason.AccountPolicyGate,
			accountName: 'octocat',
			approvedOrganizations: ['github', 'microsoft'],
			supportUrl,
		}),
	}),
	AccountPolicyGateNoAccount: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, {
			reason: SessionsBlockedReason.AccountPolicyGate,
		}),
	}),
	ManagedSettingsUnavailable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => createOverlay(ctx, {
			reason: SessionsBlockedReason.ManagedSettingsRefresh,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				lastAttemptAt: Date.now(),
			},
		}),
	}),
	ManagedSettingsUnavailableWithSupport: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => createOverlay(ctx, {
			reason: SessionsBlockedReason.ManagedSettingsRefresh,
			freshness: {
				state: ManagedSettingsFreshnessState.Blocked,
				source: 'server',
				failure: ManagedSettingsFreshnessFailure.Network,
				lastAttemptAt: Date.now(),
			},
			supportUrl,
		}),
	}),
});
