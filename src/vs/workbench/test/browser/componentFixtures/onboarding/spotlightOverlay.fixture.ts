/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { SpotlightOverlay } from '../../../../contrib/onboarding/browser/spotlight/spotlightOverlay.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'onboarding/' }, {
	SpotlightOverlay: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderSpotlightOverlay,
	}),
});

function renderSpotlightOverlay({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.width = '720px';
	container.style.height = '420px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';
	container.style.display = 'flex';
	container.style.alignItems = 'center';
	container.style.justifyContent = 'center';
	container.style.background = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-editor-foreground)';

	const targetButton = dom.append(container, dom.$<HTMLButtonElement>('button.spotlight-fixture-target'));
	targetButton.type = 'button';
	targetButton.textContent = 'Clickable target';
	targetButton.style.padding = '8px 12px';
	targetButton.style.borderRadius = 'var(--vscode-cornerRadius-small)';
	targetButton.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-button-border, transparent)';
	targetButton.style.background = 'var(--vscode-button-secondaryBackground)';
	targetButton.style.color = 'var(--vscode-button-secondaryForeground)';
	targetButton.style.cursor = 'pointer';
	targetButton.style.font = 'inherit';

	let clickCount = 0;
	disposableStore.add(dom.addDisposableListener(targetButton, dom.EventType.CLICK, () => {
		clickCount++;
		targetButton.textContent = `Clicked ${clickCount}`;
	}));

	const overlay = disposableStore.add(new SpotlightOverlay(container));
	overlay.show(targetButton, {
		title: 'Spotlight Overlay',
		description: 'This callout points at a real button. The button remains clickable through the spotlight hole.',
		stepIndex: 0,
		stepCount: 1,
		canGoBack: false,
		isLastStep: true,
	}, {
		placement: 'above',
		allowTargetInteraction: true,
	});
}
