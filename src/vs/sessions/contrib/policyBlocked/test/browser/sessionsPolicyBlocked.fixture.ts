/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionsBlockedOverlayOptions, SessionsBlockedReason, SessionsPolicyBlockedOverlay } from '../../browser/sessionsPolicyBlocked.js';

function createOverlay(ctx: ComponentFixtureContext, options: ISessionsBlockedOverlayOptions): void {
	ctx.container.style.width = '600px';
	ctx.container.style.height = '400px';
	ctx.container.style.position = 'relative';

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly quality = 'insider';
				override readonly urlProtocol = 'vscode-insiders';
			}());
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
});
