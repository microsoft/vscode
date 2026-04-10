/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { SessionsPolicyBlockedOverlay } from '../../browser/sessionsPolicyBlocked.js';

function renderPolicyBlocked({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '600px';
	container.style.height = '400px';
	container.style.position = 'relative';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly quality = 'insider';
				override readonly urlProtocol = 'vscode-insiders';
			}());
		},
	});

	disposableStore.add(instantiationService.createInstance(SessionsPolicyBlockedOverlay, container));
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	PolicyBlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderPolicyBlocked,
	}),
});
