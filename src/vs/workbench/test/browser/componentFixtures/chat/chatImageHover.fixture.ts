/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { createChatImageHoverContent } from '../../../../browser/chatImagePreview.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

async function renderImageHover(context: ComponentFixtureContext, fixtureUrl: URL, name: string): Promise<void> {
	const { container, disposableStore } = context;
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const response = await fetch(fixtureUrl);
	const imageData = new Uint8Array(await response.arrayBuffer());
	let markLoaded!: () => void;
	const loaded = new Promise<void>(resolve => markLoaded = resolve);
	const hover = createChatImageHoverContent(
		URI.file(`/repo/design/${name}.png`),
		`/repo/design/${name}.png`,
		imageData,
		`fixture:${name}`,
		() => markLoaded(),
		undefined,
		undefined,
		`Preview of ${name}`,
	);
	disposableStore.add(hover.disposable);
	hover.element.classList.add('action-list-submenu-hover-header', 'content-owns-padding');
	const panel = dom.append(container, dom.$('.action-list-submenu-panel'));
	panel.style.position = 'static';
	panel.style.display = 'inline-block';
	panel.style.width = '320px';
	panel.appendChild(hover.element);
	await loaded;
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ImageHover_Landscape: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderImageHover(context, new URL('./media/image-hover-wide.png', import.meta.url), 'refined-swipe-right-320'),
	}),
	ImageHover_Portrait: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderImageHover(context, new URL('./media/image-hover-portrait.png', import.meta.url), 'refined-chat-320'),
	}),
});
