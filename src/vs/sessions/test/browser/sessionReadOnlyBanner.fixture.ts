/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ISessionReadOnlyBannerContent, SessionReadOnlyBanner } from '../../browser/parts/sessionReadOnlyBanner.js';

export default defineThemedFixtureGroup({ path: 'sessions/readOnlyBanner/' }, {
	// Generic read-only chat (e.g. a subagent transcript): message only.
	ReadOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, { message: 'This chat is read-only' }),
	}),

	// Archived session: archived-specific message plus an inline "Restore" action.
	Archived: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderBanner(context, {
			message: 'This session is archived and read-only.',
			action: { label: 'Restore', run: () => console.log('Restore') },
		}),
	}),
});

function renderBanner({ container, disposableStore }: ComponentFixtureContext, content: ISessionReadOnlyBannerContent): void {
	container.style.width = '480px';
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editorWidget-background)';

	const banner = disposableStore.add(new SessionReadOnlyBanner());
	banner.setContent(content);
	banner.setVisible(true);
	container.appendChild(banner.domNode);
}
