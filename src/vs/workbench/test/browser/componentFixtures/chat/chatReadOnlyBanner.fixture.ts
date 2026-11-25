/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ChatReadOnlyBanner, getArchivedChatReadOnlyBannerContent, IChatReadOnlyBannerContent } from '../../../../contrib/chat/browser/widget/chatReadOnlyBanner.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ReadOnlyBanner: defineComponentFixture({ render: context => renderReadOnlyBanner(context) }),
	// An archived session offers to restore it with the configured archive wording.
	ReadOnlyBannerArchived: defineComponentFixture({
		render: context => renderReadOnlyBanner(context, getArchivedChatReadOnlyBannerContent(ChatSessionArchiveActionWording.MarkAsDone, () => { })),
	}),
});

function renderReadOnlyBanner({ container, disposableStore, theme }: ComponentFixtureContext, content?: IChatReadOnlyBannerContent): void {
	container.style.width = '480px';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const banner = disposableStore.add(instantiationService.createInstance(ChatReadOnlyBanner));
	if (content) {
		banner.setContent(content);
	}
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
