/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';
import { createTestAuxiliaryBarPart } from '../parts/auxiliaryBarTestUtils.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../browser/media/part.css';
function renderTitle({ container, disposableStore }: ComponentFixtureContext, width: number): void {
	container.style.width = `${width}px`;
	container.style.height = '36px';
	const root = append(container, $('.monaco-workbench'));
	const element = append(root, $('.part.auxiliarybar'));
	element.style.width = `${width}px`;
	element.style.backgroundColor = 'var(--vscode-sideBar-background)';
	const part = createTestAuxiliaryBarPart(element, disposableStore);
	part.layout(width, 36, 0, 0);
	part.toolbar.relayout();
}

export default defineThemedFixtureGroup({ path: 'workbench/' }, {
	Narrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: ctx => renderTitle(ctx, 140),
	}),
	Medium: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: ctx => renderTitle(ctx, 185),
	}),
	Wide: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: ctx => renderTitle(ctx, 360),
	}),
});
