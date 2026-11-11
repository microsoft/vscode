/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAICustomizationItemsModel } from '../../../chat/browser/aiCustomization/aiCustomizationItemsModel.js';
import { IAgentHostToolSetEnablementService } from '../../../chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../chat/common/customizationHarnessService.js';
import { ILanguageModelToolsService, IToolSet } from '../../../chat/common/tools/languageModelToolsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { IAgentsWindowExtensionSuggestionsService } from '../../browser/agentsWindowExtensionSuggestions.js';
import { IAICustomizationMcpServerCountService } from '../../browser/customizationMcpServerCount.js';

suite('AI customization shortcuts header', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let header: HTMLElement;

	setup(() => {
		container = DOM.append(mainWindow.document.body, DOM.$('div'));
		container.style.cssText = 'position: fixed; top: 0; left: 0; width: 300px; height: 200px; z-index: 10000;';
		disposables.add(toDisposable(() => container.remove()));

		const instantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
		instantiationService.stub(IAICustomizationItemsModel, {
			getCount: () => constObservable(1),
			getPluginCount: () => constObservable(1),
		});
		instantiationService.stub(IAICustomizationMcpServerCountService, { count: constObservable(1) });
		instantiationService.stub(ILanguageModelToolsService, { toolSets: constObservable<readonly IToolSet[]>([]) });
		instantiationService.stub(IAgentHostToolSetEnablementService, {
			observe: () => constObservable({ toolSets: new Map<string, boolean>(), tools: new Map<string, boolean>() }),
		});
		const descriptor = upcastPartial<IHarnessDescriptor>({ id: 'test', label: 'Test', icon: Codicon.extensions });
		instantiationService.stub(ICustomizationHarnessService, {
			activeHarness: constObservable('test'),
			availableHarnesses: constObservable([descriptor]),
			getActiveDescriptor: () => descriptor,
		});
		instantiationService.stub(IAgentsWindowExtensionSuggestionsService, { showBadge: constObservable(false) });
		disposables.add(instantiationService.createInstance(AICustomizationShortcutsWidget, container, undefined));

		const renderedHeader = container.querySelector<HTMLElement>('.ai-customization-header');
		assert.ok(renderedHeader);
		header = renderedHeader;
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size60', '6px');
		container.style.setProperty('--vscode-spacing-size100', '10px');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-list-hoverBackground', 'rgb(240, 240, 240)');
		container.style.setProperty('--vscode-list-hoverForeground', 'rgb(0, 0, 0)');
		container.style.setProperty('--vscode-contrastActiveBorder', 'rgb(255, 0, 0)');
		container.style.setProperty('--vscode-strongForeground', 'rgb(255, 255, 255)');
		container.style.setProperty('--vscode-descriptionForeground', 'rgb(200, 200, 200)');
	});

	test('keeps both edges clickable while the hover remains inset', () => {
		header.classList.add('hovered');
		const toolbar = container.querySelector<HTMLElement>('.ai-customization-toolbar');
		assert.ok(toolbar);
		const bounds = toolbar.getBoundingClientRect();
		const headerBounds = header.getBoundingClientRect();
		const clickAt = (x: number) => {
			const target = mainWindow.document.elementFromPoint(x, headerBounds.top + headerBounds.height / 2);
			if (target instanceof HTMLElement) {
				target.click();
			}
			return { header: target === header, expanded: header.getAttribute('aria-expanded') };
		};
		const left = clickAt(bounds.left + 1);
		const right = clickAt(bounds.right - 1);
		const hoverStyle = mainWindow.getComputedStyle(header, '::before');

		assert.deepStrictEqual({ left, right, hoverInsets: [hoverStyle.left, hoverStyle.right] }, {
			left: { header: true, expanded: 'false' },
			right: { header: true, expanded: 'true' },
			hoverInsets: ['4px', '4px'],
		});
	});

	test('pairs the hover background with themed text and a contrast outline', () => {
		header.click();
		header.classList.add('hovered');
		const label = header.querySelector<HTMLElement>('.ai-customization-header-label');
		const count = header.querySelector<HTMLElement>('.ai-customization-header-total-count');
		const chevron = header.querySelector<HTMLElement>('.ai-customization-chevron');
		assert.ok(label && count && chevron);
		const colors = () => ({
			label: mainWindow.getComputedStyle(label).color,
			count: mainWindow.getComputedStyle(count).color,
			chevron: mainWindow.getComputedStyle(chevron).color,
			chevronOpacity: mainWindow.getComputedStyle(chevron).opacity,
		});
		const hoverStyle = mainWindow.getComputedStyle(header, '::before');
		const themed = colors();
		const background = hoverStyle.backgroundColor;
		const outline = [hoverStyle.outlineStyle, hoverStyle.outlineColor];
		container.style.setProperty('--vscode-list-hoverForeground', 'initial');
		const fallback = colors();

		assert.deepStrictEqual({ background, outline, themed, fallback }, {
			background: 'rgb(240, 240, 240)',
			outline: ['dashed', 'rgb(255, 0, 0)'],
			themed: { label: 'rgb(0, 0, 0)', count: 'rgb(0, 0, 0)', chevron: 'rgb(0, 0, 0)', chevronOpacity: '1' },
			fallback: { label: 'rgb(255, 255, 255)', count: 'rgb(200, 200, 200)', chevron: 'rgb(200, 200, 200)', chevronOpacity: '1' },
		});
	});

	test('preserves the hover outline after pointer focus and the keyboard focus ring', () => {
		header.classList.add('hovered');
		container.style.setProperty('--vscode-focusBorder', 'rgb(0, 0, 255)');

		const pointerFocus = { preventScroll: true, focusVisible: false };
		header.focus(pointerFocus);
		const pointer = {
			focusVisible: header.matches(':focus-visible'),
			headerOutline: mainWindow.getComputedStyle(header).outlineStyle,
			hoverOutline: mainWindow.getComputedStyle(header, '::before').outlineStyle,
		};

		header.blur();
		const keyboardFocus = { preventScroll: true, focusVisible: true };
		header.focus(keyboardFocus);
		const keyboard = {
			focusVisible: header.matches(':focus-visible'),
			headerOutline: mainWindow.getComputedStyle(header).outlineStyle,
			headerOutlineColor: mainWindow.getComputedStyle(header).outlineColor,
			hoverOutline: mainWindow.getComputedStyle(header, '::before').outlineStyle,
		};

		assert.deepStrictEqual({ pointer, keyboard }, {
			pointer: { focusVisible: false, headerOutline: 'none', hoverOutline: 'dashed' },
			keyboard: { focusVisible: true, headerOutline: 'solid', headerOutlineColor: 'rgb(0, 0, 255)', hoverOutline: 'none' },
		});
	});
});
