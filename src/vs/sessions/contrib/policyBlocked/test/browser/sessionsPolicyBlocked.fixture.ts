/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsBlockedOverlayOptions, SessionsBlockedReason, SessionsPolicyBlockedOverlay } from '../../browser/sessionsPolicyBlocked.js';
import { getManagedPluginBlockInfo } from '../../../../../workbench/contrib/chat/common/plugins/managedPluginAvailability.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

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
			reg.definePartialInstance(IWorkbenchLayoutService, {
				mainContainer: ctx.container,
				mainContainerOffset: { top: 0, quickPickTop: 0 },
				getContainer: () => undefined,
				onDidLayoutMainContainer: Event.None,
			});
			reg.definePartialInstance(ISessionsPartService, { focusSession: () => { } });
			reg.definePartialInstance(ISessionsService, { activeSession: constObservable(undefined) });
		},
	});

	ctx.disposableStore.add(instantiationService.createInstance(SessionsPolicyBlockedOverlay, ctx.container, options));
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	PolicyBlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => createOverlay(ctx, { reason: SessionsBlockedReason.AgentDisabled }),
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
	RequiredPluginsUnavailable: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => createOverlay(ctx, {
			reason: SessionsBlockedReason.RequiredPlugins,
			shouldFocus: false,
			pluginInfo: getManagedPluginBlockInfo({ kind: 'unavailable', pluginIds: ['required-demo@managed-marketplace'] }),
		}),
	}),
});
