/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CopyButton } from '../../../../base/browser/ui/button/copyButton.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'base/' }, {
	CopyButton: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { durationMs: 500 },
		expectedVisualDescriptions: ['Three captioned rows show the same icon-only copy control at rest, displaying a success checkmark, and disabled. The success state does not change the control size.'],
		render: renderCopyButtons,
	}),
});

async function renderCopyButtons({ container, disposableStore }: ComponentFixtureContext): Promise<void> {
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = 'var(--vscode-spacing-size120)';
	container.style.padding = 'var(--vscode-spacing-size160)';
	container.style.color = 'var(--vscode-foreground)';

	for (const state of ['Copy', 'Copied', 'Disabled']) {
		const row = dom.append(container, dom.$('div'));
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = 'var(--vscode-spacing-size120)';
		const button = disposableStore.add(new CopyButton(row, {
			copy: async () => { },
			disabled: state === 'Disabled',
		}));
		dom.append(row, dom.$('span', undefined, state));
		if (state === 'Copied') {
			await button.copy();
		}
	}
}
