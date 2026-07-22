/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatReadOnlyBanner } from '../../../../contrib/chat/browser/widget/chatReadOnlyBanner.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ReadOnlyBanner: defineComponentFixture({ render: renderReadOnlyBanner }),
});

function renderReadOnlyBanner({ container, disposableStore, theme }: ComponentFixtureContext): void {
	container.style.width = '480px';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const banner = disposableStore.add(instantiationService.createInstance(ChatReadOnlyBanner));
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
