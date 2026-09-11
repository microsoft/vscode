/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { DECORATION_BADGE_CLASS } from '../../../../services/decorations/common/decorations.js';
import '../../../../contrib/scm/browser/media/scm.css';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

interface SCMDecorationFixture {
	readonly fileName: string;
	readonly letter: string;
	readonly tooltip: string;
	readonly color: string;
	readonly strikethrough?: boolean;
}

const decorations: readonly SCMDecorationFixture[] = [
	{ fileName: 'modified.ts', letter: 'M', tooltip: 'Modified', color: 'var(--vscode-gitDecoration-modifiedResourceForeground)' },
	{ fileName: 'untracked.ts', letter: 'U', tooltip: 'Untracked', color: 'var(--vscode-gitDecoration-untrackedResourceForeground)' },
	{ fileName: 'deleted.ts', letter: 'D', tooltip: 'Deleted', color: 'var(--vscode-gitDecoration-deletedResourceForeground)', strikethrough: true },
	{ fileName: 'renamed.ts', letter: 'R', tooltip: 'Renamed', color: 'var(--vscode-gitDecoration-renamedResourceForeground)' },
];

export default defineThemedFixtureGroup({ path: 'scm/' }, {
	ResourceDecorations: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: [
			'Four Source Control resource rows show modified, untracked, deleted, and renamed files. The M, U, D, and R decorations use the same text size, each is centered in an equal-width box, and their centers form one vertical column. The deleted filename is struck through and each decoration retains its Git theme color.',
		],
		render: renderResourceDecorations,
	}),
});

function renderResourceDecorations({ container, disposableStore }: ComponentFixtureContext): void {
	container.classList.add('scm-view');
	container.style.width = '280px';
	container.style.padding = '12px';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-fontSize-body1)';
	container.style.setProperty('--vscode-gitDecoration-modifiedResourceForeground', 'var(--vscode-editorWarning-foreground)');
	container.style.setProperty('--vscode-gitDecoration-untrackedResourceForeground', 'var(--vscode-charts-green)');
	container.style.setProperty('--vscode-gitDecoration-deletedResourceForeground', 'var(--vscode-editorError-foreground)');
	container.style.setProperty('--vscode-gitDecoration-renamedResourceForeground', 'var(--vscode-charts-yellow)');

	const decorationStyles = $('style');
	decorationStyles.textContent = decorations
		.map((decoration, index) => `.scm-decoration-${index}::after { content: '${decoration.letter}'; color: ${decoration.color}; }`)
		.join('\n');
	container.appendChild(decorationStyles);

	const list = $('.monaco-list');
	container.appendChild(list);

	for (const [index, decoration] of decorations.entries()) {
		const row = $('.monaco-list-row');
		row.style.position = 'relative';
		row.style.height = '22px';
		list.appendChild(row);

		const resource = $('.resource');
		row.appendChild(resource);

		const name = $('.name');
		resource.appendChild(name);

		const label = disposableStore.add(new IconLabel(name));
		label.setLabel(decoration.fileName, undefined, {
			extraClasses: [DECORATION_BADGE_CLASS, `scm-decoration-${index}`],
			strikethrough: decoration.strikethrough,
			title: `${decoration.fileName} • ${decoration.tooltip}`,
		});
	}
}
