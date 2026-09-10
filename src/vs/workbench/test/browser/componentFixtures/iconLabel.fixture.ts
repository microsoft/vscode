/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IconLabel, IIconLabelValueOptions } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'base/' }, {
	IconLabels: defineComponentFixture({
		fileIconTheme: 'vs-seti',
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Five captioned rows show the shared IconLabel with a pseudo-element file icon, a file icon through the explicit iconPath path, an icon-rich label containing an inline check icon, an icon with no separation, and a long label with a description truncated at the fixed guide. The first two labels begin at the same horizontal position after equal fixed icon slots and separation.'],
		render: renderIconLabels,
	}),
});

function renderIconLabels({ container, disposableStore }: ComponentFixtureContext): void {
	container.classList.add('show-file-icons');
	container.style.width = '480px';
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-fontSize-label1)';

	addLabel('Pseudo-element icon', 'File label', {
		extraClasses: ['file-icon', 'typescript-lang-file-icon'],
		title: 'File label',
	});
	addLabel('Explicit iconPath', 'File label', {
		iconPath: Codicon.file,
		title: 'File label',
	});
	addLabel('Inline label icon', 'File $(check) ready', {
		iconPath: Codicon.file,
		title: 'File ready',
	});
	addLabel('No separation', 'Icon only composition', {
		iconPath: Codicon.file,
		iconLabelSpacing: 'none',
		title: 'Icon only composition',
	});
	addLabel('Truncation', 'A very long resource label that must truncate predictably', {
		iconPath: Codicon.file,
		title: 'A very long resource label that must truncate predictably',
	}, 'src/vs/base/browser/ui/iconLabel');

	function addLabel(caption: string, label: string, options: IIconLabelValueOptions, description?: string): void {
		const row = dom.append(container, dom.$('.fixture-row'));
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '16px';

		const captionElement = dom.append(row, dom.$('span'));
		captionElement.textContent = caption;
		captionElement.style.flex = '0 0 140px';
		captionElement.style.color = 'var(--vscode-descriptionForeground)';

		const labelHost = dom.append(row, dom.$('.fixture-label-host'));
		labelHost.style.width = '240px';
		labelHost.style.minWidth = '0';
		const iconLabel = disposableStore.add(new IconLabel(labelHost, { supportIcons: true }));
		iconLabel.setLabel(label, description, options);
	}
}
