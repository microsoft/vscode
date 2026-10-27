/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { node } from './ui.js';

function shape(tag, attributes) {
	const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, String(value));
	}
	return element;
}

function illustration(theme, agents) {
	const p = theme.palette;
	const svg = shape('svg', { viewBox: '0 0 280 164', role: 'img', 'aria-label': `${theme.id}: ${agents ? 'Agents window' : 'Editor'} shell illustration` });
	const rect = (x, y, width, height, fill, extra = {}) => {
		const element = shape('rect', { x, y, width, height, fill, ...extra });
		svg.append(element);
		return element;
	};
	const line = (x, y, width, fill = p.foreground, opacity = 0.35) => rect(x, y, width, 3, fill, { rx: 2, opacity });
	rect(0, 0, 280, 164, agents ? p.agents : p.editor);
	if (!agents) {
		rect(0, 0, 280, 18, p.title);
		rect(0, 18, 18, 132, p.activity);
		for (let row = 0; row < 5; row++) {
			rect(6, 28 + row * 20, 6, 6, p.activityForeground, { rx: 2, opacity: row ? 0.5 : 1 });
		}
		rect(18, 18, 60, 132, p.sidebar);
		for (let row = 0; row < 7; row++) {
			line(26 + (row % 2) * 4, 33 + row * 13, 30 + (row % 3) * 4);
		}
		rect(78, 18, 202, 16, p.sidebar);
		rect(78, 18, 58, 16, p.editor);
		line(89, 25, 34, p.foreground, 0.6);
		for (let row = 0; row < 8; row++) {
			const x = 96 + (row % 3) * 8;
			line(x, 49 + row * 11, 72 + (row % 4) * 18, row % 3 === 1 ? p.accent : p.foreground, 0.6);
		}
		rect(0, 150, 280, 14, p.status);
		rect(78, 18, 1, 132, p.border);
	} else {
		rect(8, 7, 12, 4, p.accent, { rx: 2 });
		rect(92, 5, 96, 10, p.agentsPanel, { rx: 4 });
		const panel = (x, y, width, height, fill = p.agentsPanel) => rect(x, y, width, height, fill, {
			rx: 6, stroke: p.agentsBorder, 'stroke-opacity': p.agentsBorderOpacity,
		});
		panel(8, 24, 62, 132);
		line(16, 34, 30, p.foreground, 0.6);
		for (let row = 0; row < 6; row++) {
			if (row === 1) {
				rect(13, 58, 52, 16, p.accent, { rx: 4, opacity: 0.18 });
			}
			line(18, 49 + row * 16, 26 + (row % 3) * 6);
		}
		panel(78, 24, 126, 132);
		line(88, 35, 44, p.foreground, 0.7);
		rect(88, 49, 106, 20, p.accent, { rx: 4, opacity: 0.15 });
		for (let row = 0; row < 4; row++) {
			line(88, 80 + row * 9, 58 + (row % 3) * 14);
		}
		rect(86, 126, 110, 22, p.editor, { rx: 4, stroke: p.agentsBorder, 'stroke-opacity': p.agentsBorderOpacity });
		line(94, 135, 52);
		rect(182, 134, 6, 6, p.accent, { rx: 2 });
		panel(212, 24, 60, 78, p.detail);
		line(220, 35, 32, p.foreground, 0.6);
		for (let row = 0; row < 4; row++) {
			line(220, 50 + row * 10, 28 + (row % 2) * 8);
		}
		panel(212, 110, 60, 46);
		line(220, 121, 30, p.foreground, 0.5);
		line(220, 133, 38);
	}
	return svg;
}

export function renderThemeGallery(content, system) {
	content.append(node('p', 'All built-in themes, shown as simple editor and Agents-window silhouettes. These are schematic illustrations, not live workbench renders; syntax-only theme differences may look identical here.', 'muted'));
	const grid = node('div', undefined, 'theme-gallery');
	for (const theme of system.themeGallery) {
		const card = node('article', undefined, 'card theme-card');
		card.dataset.theme = theme.id;
		const heading = node('div', undefined, 'theme-card-heading');
		const type = theme.type.startsWith('hc') ? 'High contrast' : theme.type === 'vs' ? 'Light' : 'Dark';
		heading.append(node('h3', theme.id), node('span', type, 'meta'));
		const pair = node('div', undefined, 'theme-shell-pair');
		for (const agents of [false, true]) {
			const figure = node('figure');
			figure.append(illustration(theme, agents), node('figcaption', agents ? 'Agents window' : 'Editor', 'meta'));
			pair.append(figure);
		}
		card.append(heading, pair);
		grid.append(card);
	}
	content.append(grid);
	return system.themeGallery.length;
}
