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
import { IAICustomizationWorkspaceService } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../chat/common/customizationHarnessService.js';
import { ILanguageModelToolsService, IToolSet } from '../../../chat/common/tools/languageModelToolsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { AICustomizationShortcutsWidget } from '../../browser/aiCustomizationShortcutsWidget.js';
import { IAICustomizationMcpServerCountService } from '../../browser/customizationMcpServerCount.js';

suite('AI customization shortcuts header', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;
	let header: HTMLElement;

	// A cycle invalidates the token without inheriting a value from the surrounding theme.
	const invalidateToken = (name: string) => container.style.setProperty(name, `var(${name})`);

	setup(() => {
		container = DOM.append(mainWindow.document.body, DOM.$('.monaco-workbench.hc-black'));
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
		instantiationService.stub(IAICustomizationWorkspaceService, { managementSections: [] });
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
		const label = header.querySelector<HTMLElement>('.ai-customization-header-label');
		assert.ok(toolbar && label);
		const bounds = toolbar.getBoundingClientRect();
		const headerBounds = header.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const clickAt = (x: number) => {
			const target = mainWindow.document.elementFromPoint(x, headerBounds.top + headerBounds.height / 2);
			target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			return { target, expanded: header.getAttribute('aria-expanded') };
		};
		const clicks = [bounds.left + 1, bounds.right - 1, labelBounds.left + labelBounds.width / 2].map(clickAt);
		const hoverStyle = mainWindow.getComputedStyle(header, '::before');

		assert.deepStrictEqual({
			insideHeader: clicks.map(({ target }) => header.contains(target)),
			lastHitIsDescendant: clicks[2].target !== header,
			expanded: clicks.map(({ expanded }) => expanded),
			hoverInsets: [hoverStyle.left, hoverStyle.right],
		}, {
			insideHeader: [true, true, true],
			lastHitIsDescendant: true,
			expanded: ['false', 'true', 'false'],
			hoverInsets: ['4px', '4px'],
		});
	});

	test('keeps the hover geometry when size tokens are unavailable', () => {
		for (const token of ['--vscode-spacing-size40', '--vscode-spacing-size60', '--vscode-spacing-size100', '--vscode-cornerRadius-small', '--vscode-strokeThickness']) {
			invalidateToken(token);
		}
		header.click();
		header.classList.add('hovered');
		const headerStyle = mainWindow.getComputedStyle(header);
		const hoverStyle = mainWindow.getComputedStyle(header, '::before');

		assert.deepStrictEqual({
			padding: [headerStyle.paddingTop, headerStyle.paddingRight],
			insets: [hoverStyle.left, hoverStyle.right],
			radius: hoverStyle.borderTopLeftRadius,
			outline: [headerStyle.outlineStyle, headerStyle.outlineWidth, headerStyle.outlineOffset],
			fillOutline: hoverStyle.outlineStyle,
		}, {
			padding: ['6px', '10px'],
			insets: ['4px', '4px'],
			radius: '4px',
			outline: ['dashed', '1px', '-1px'],
			fillOutline: 'none',
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
		const headerStyle = mainWindow.getComputedStyle(header);
		const outline = [headerStyle.outlineStyle, headerStyle.outlineColor];
		const fillOutline = hoverStyle.outlineStyle;
		invalidateToken('--vscode-list-hoverForeground');
		const fallback = colors();

		assert.deepStrictEqual({ background, outline, fillOutline, themed, fallback }, {
			background: 'rgb(240, 240, 240)',
			outline: ['dashed', 'rgb(255, 0, 0)'],
			fillOutline: 'none',
			themed: { label: 'rgb(0, 0, 0)', count: 'rgb(0, 0, 0)', chevron: 'rgb(0, 0, 0)', chevronOpacity: '1' },
			fallback: { label: 'rgb(255, 255, 255)', count: 'rgb(200, 200, 200)', chevron: 'rgb(200, 200, 200)', chevronOpacity: '1' },
		});
	});

	test('preserves the hover outline after pointer focus and the keyboard focus ring', function () {
		// Hidden Electron windows do not match focus pseudo-classes; run this check in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}

		container.style.setProperty('--vscode-focusBorder', 'rgb(0, 0, 255)');

		for (const theme of ['hc-black', 'hc-light']) {
			container.classList.remove('hc-black', 'hc-light');
			container.classList.add(theme);
			if (header.ariaExpanded === 'true') {
				header.click();
			}
			header.classList.remove('hovered');

			// Avoid inheriting focus-visible from a previously focused test element.
			const activeElement = mainWindow.document.activeElement;
			if (activeElement instanceof HTMLElement) {
				activeElement.blur();
			}
			const pointerFocus = { preventScroll: true, focusVisible: false };
			header.focus(pointerFocus);
			const unhoveredBoundary = mainWindow.getComputedStyle(header).outlineStyle;
			header.classList.add('hovered');
			const pointer = {
				focused: mainWindow.document.activeElement === header,
				focusVisible: header.matches(':focus-visible'),
				outline: [mainWindow.getComputedStyle(header).outlineStyle, mainWindow.getComputedStyle(header).outlineColor],
				fillOutline: mainWindow.getComputedStyle(header, '::before').outlineStyle,
			};

			header.click();
			const expanded = {
				outline: [mainWindow.getComputedStyle(header).outlineStyle, mainWindow.getComputedStyle(header).outlineColor],
				fillOutline: mainWindow.getComputedStyle(header, '::before').outlineStyle,
			};
			header.blur();
			const keyboardFocus = { preventScroll: true, focusVisible: true };
			header.focus(keyboardFocus);
			const keyboard = {
				focused: mainWindow.document.activeElement === header,
				focusVisible: header.matches(':focus-visible'),
				outline: [mainWindow.getComputedStyle(header).outlineStyle, mainWindow.getComputedStyle(header).outlineColor],
				fillOutline: mainWindow.getComputedStyle(header, '::before').outlineStyle,
			};

			assert.deepStrictEqual({ unhoveredBoundary, pointer, expanded, keyboard }, {
				unhoveredBoundary: 'none',
				pointer: { focused: true, focusVisible: false, outline: ['dashed', 'rgb(255, 0, 0)'], fillOutline: 'none' },
				expanded: { outline: ['solid', 'rgb(255, 0, 0)'], fillOutline: 'none' },
				keyboard: { focused: true, focusVisible: true, outline: ['solid', 'rgb(0, 0, 255)'], fillOutline: 'none' },
			}, theme);
		}
	});
});
