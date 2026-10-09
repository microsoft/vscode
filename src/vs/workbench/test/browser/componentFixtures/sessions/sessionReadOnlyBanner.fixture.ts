/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import { SessionReadOnlyBanner } from '../../../../../sessions/browser/parts/sessionReadOnlyBanner.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	ReadOnlyBanner: defineComponentFixture({ render: renderReadOnlyBanner }),
});

function renderReadOnlyBanner({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '480px';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const banner = disposableStore.add(instantiationService.createInstance(SessionReadOnlyBanner));
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
