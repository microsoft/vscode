/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { createChatImageHoverContent } from '../../../../browser/chatImagePreview.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function createSvg(width: number, height: number, label: string): Uint8Array {
	return new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
			<defs>
				<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stop-color="#7456d7"/>
					<stop offset="1" stop-color="#19a7a0"/>
				</linearGradient>
			</defs>
			<rect width="${width}" height="${height}" rx="24" fill="url(#background)"/>
			<circle cx="${Math.round(width * 0.8)}" cy="${Math.round(height * 0.25)}" r="${Math.round(Math.min(width, height) * 0.12)}" fill="#f8dc75"/>
			<path d="M0 ${height} ${Math.round(width * 0.25)} ${Math.round(height * 0.45)} ${Math.round(width * 0.46)} ${Math.round(height * 0.75)} ${Math.round(width * 0.65)} ${Math.round(height * 0.55)} ${width} ${height}Z" fill="#15202b" opacity=".78"/>
			<text x="24" y="42" fill="#fff" font-family="sans-serif" font-size="20" font-weight="600">${label}</text>
		</svg>`);
}

async function renderImageHover(context: ComponentFixtureContext, width: number, height: number, name: string): Promise<void> {
	const { container, disposableStore } = context;
	container.style.padding = '24px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	let markLoaded!: () => void;
	const loaded = new Promise<void>(resolve => markLoaded = resolve);
	const hover = createChatImageHoverContent(
		URI.file(`/repo/design/${name}.svg`),
		`/repo/design/${name}.svg`,
		createSvg(width, height, `${width > height ? 'Wide' : 'Portrait'} reference`),
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
	ImageHover_Wide: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderImageHover(context, 720, 240, 'wide-reference'),
	}),
	ImageHover_Portrait: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderImageHover(context, 240, 480, 'portrait-reference'),
	}),
});
