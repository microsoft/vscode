/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { AgentsWindowGraphicDesign } from '../../../../contrib/chat/browser/agentSessions/agentsWindowGraphic.js';
import { AgentsWindowHoverCard } from '../../../../contrib/chat/browser/agentSessions/agentsWindowHoverCard.js';
import { AgentsWindowGraphicVariant } from '../../../../contrib/chat/common/constants.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

const highContrastThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ManyWindowsToOne: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderHoverCard(context, AgentsWindowGraphicVariant.ManyWindowsToOne),
	}),
	WindowComparison: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: highContrastThemes,
		render: context => renderHoverCard(context, AgentsWindowGraphicVariant.WindowComparison),
	}),
});

/** Shows the hover card below a stand-in for the title bar's Agents window button, the way the button's managed hover shows it. */
function renderHoverCard({ container, disposableStore, theme }: ComponentFixtureContext, design: AgentsWindowGraphicDesign): void {
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registry => {
			registerWorkbenchServices(registry);
			registry.define(IMarkdownRendererService, MarkdownRendererService);
			registry.definePartialInstance(ILayoutService, { getContainer: () => container });
			registry.define(IHoverService, class extends HoverService {
				override showInstantHover(options: Parameters<IHoverService['showInstantHover']>[0]) {
					return super.showInstantHover({ ...options, container }, false);
				}
			});
		},
	});

	container.style.width = '400px';
	container.style.height = '420px';
	container.style.background = 'var(--vscode-titleBar-activeBackground)';
	const button = $('.fixture-title-bar-button', {}, 'Agents');
	button.style.cssText = 'display: inline-block; margin: 8px 0 0 48px; padding: 2px 6px;';
	container.appendChild(button);

	const card = disposableStore.add(new AgentsWindowHoverCard({ design, onOpen: () => { } }));
	const hover = instantiationService.get(IHoverService).showInstantHover({
		content: card.element,
		target: button,
		additionalClasses: ['managed-hover-content-owns-padding'],
		position: { hoverPosition: HoverPosition.BELOW },
		appearance: { showPointer: true, compact: true, skipFadeInAnimation: true },
		persistence: { sticky: true },
	});
	if (hover) {
		disposableStore.add(hover);
	}

	// Fit the fixture to the hover, whose height depends on the graphic.
	const hoverElement = card.element.closest('.monaco-hover');
	if (!hoverElement) {
		throw new Error('The Agents window hover card fixture did not show its hover.');
	}
	container.style.height = `${Math.ceil(hoverElement.getBoundingClientRect().bottom - container.getBoundingClientRect().top) + 16}px`;
}
