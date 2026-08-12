/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import { SessionReadOnlyBanner } from '../../../../../sessions/browser/parts/sessionReadOnlyBanner.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	ReadOnlyBanner: defineComponentFixture({ render: renderReadOnlyBanner }),
});

function renderReadOnlyBanner({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.width = '480px';

	const banner = disposableStore.add(new SessionReadOnlyBanner());
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
