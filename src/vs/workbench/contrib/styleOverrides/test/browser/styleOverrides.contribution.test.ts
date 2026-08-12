/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Pane } from '../../../../../base/browser/ui/splitview/paneview.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as ThemingExtensions, IColorRegistry } from '../../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_BORDER, SURFACE_BORDER } from '../../../../common/theme.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import '../../../../browser/parts/activitybar/media/activityaction.css';
import '../../../../browser/parts/media/paneCompositePart.css';
import { StyleOverridesContribution } from '../../browser/styleOverrides.contribution.js';

class StyleOverridesTestPane extends Pane {

	constructor() {
		super({ title: 'Test', minimumBodySize: 0, maximumBodySize: 0 });
		this.render();
	}

	protected renderHeader(container: HTMLElement): void { }
	protected renderBody(container: HTMLElement): void { }
	protected layoutBody(height: number, width: number): void { }
}

class StyleOverridesTestLayoutService extends TestLayoutService {

	override mainContainer = document.createElement('div');
	override containers = [this.mainContainer];
	override activeContainer = this.mainContainer;

	readonly onDidAddContainerEmitter = new Emitter<{ container: HTMLElement; disposables: DisposableStore }>();
	override readonly onDidAddContainer = this.onDidAddContainerEmitter.event;
	layoutCount = 0;

	override layout(): void {
		this.layoutCount++;
	}

	addContainer(container: HTMLDivElement, disposables: DisposableStore): void {
		this.containers.push(container);
		this.onDidAddContainerEmitter.fire({ container, disposables });
	}
}

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

function createCompositeAction(root: HTMLElement, titleHeight: number, checked: boolean, icon = false): { actionItem: HTMLElement; actionLabel: HTMLElement; indicator: HTMLElement } {
	root.style.setProperty('--vscode-spacing-size20', '2px');
	root.style.setProperty('--vscode-spacing-size40', '4px');
	root.style.setProperty('--vscode-spacing-size240', '24px');
	root.style.setProperty('--vscode-spacing-size320', '32px');
	root.style.setProperty('--vscode-fontWeight-regular', '400');
	root.style.setProperty('--vscode-fontWeight-semiBold', '600');
	const part = appendElement(root, 'part pane-composite-part');
	const title = appendElement(part, 'title');
	title.style.height = `${titleHeight}px`;
	const compositeBarContainer = appendElement(title, 'composite-bar-container');
	const compositeBar = appendElement(compositeBarContainer, 'composite-bar');
	const actionBar = appendElement(compositeBar, 'monaco-action-bar');
	const actionsContainer = appendElement(actionBar, 'actions-container');
	const actionItem = appendElement(actionsContainer, `action-item${checked ? ' checked' : ''}${icon ? ' icon' : ''}`);
	actionItem.tabIndex = 0;
	const actionLabel = appendElement(actionItem, 'action-label');
	const indicator = appendElement(actionItem, 'active-item-indicator');
	return { actionItem, actionLabel, indicator };
}

suite('StyleOverridesContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const colorRegistry = Registry.as<IColorRegistry>(ThemingExtensions.ColorContribution);

	test('applies startup values without relayout and relayouts once when toggled', async () => {
		const configurationService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS]: true,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new StyleOverridesTestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		store.add(new StyleOverridesContribution(configurationService, layoutService));
		const pane = store.add(new StyleOverridesTestPane());
		const paneView = document.createElement('div');
		paneView.classList.add('monaco-pane-view');
		paneView.appendChild(pane.element);
		layoutService.mainContainer.appendChild(paneView);
		document.body.appendChild(layoutService.mainContainer);
		store.add(toDisposable(() => layoutService.mainContainer.remove()));

		const auxiliaryContainer = document.createElement('div');
		const auxiliaryDisposables = store.add(new DisposableStore());
		layoutService.addContainer(auxiliaryContainer, auxiliaryDisposables);

		const startupState = {
			mainEnabled: layoutService.mainContainer.classList.contains('style-override'),
			mainTabsEnabled: layoutService.mainContainer.classList.contains('modern-ui-tabs'),
			mainUppercaseViewHeaders: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			auxiliaryEnabled: auxiliaryContainer.classList.contains('style-override'),
			auxiliaryTabsEnabled: auxiliaryContainer.classList.contains('modern-ui-tabs'),
			auxiliaryUppercaseViewHeaders: auxiliaryContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneHeaderSize: pane.minimumSize,
			paneHeaderLineHeight: getWindow(pane.draggableElement!).getComputedStyle(pane.draggableElement!).lineHeight,
			paneHeaderInlineLineHeight: pane.draggableElement!.style.lineHeight,
			layoutCount: layoutService.layoutCount,
		};

		await configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, false);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === LayoutSettings.MODERN_UI,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([LayoutSettings.MODERN_UI]),
			change: { keys: [LayoutSettings.MODERN_UI], overrides: [] }
		});

		assert.deepStrictEqual({
			startupState,
			mainEnabledAfterToggle: layoutService.mainContainer.classList.contains('style-override'),
			mainTabsEnabledAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-tabs'),
			mainUppercaseViewHeadersAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			auxiliaryEnabledAfterToggle: auxiliaryContainer.classList.contains('style-override'),
			auxiliaryTabsEnabledAfterToggle: auxiliaryContainer.classList.contains('modern-ui-tabs'),
			auxiliaryUppercaseViewHeadersAfterToggle: auxiliaryContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneHeaderSizeAfterToggle: pane.minimumSize,
			paneHeaderLineHeightAfterToggle: getWindow(pane.draggableElement!).getComputedStyle(pane.draggableElement!).lineHeight,
			paneHeaderInlineLineHeightAfterToggle: pane.draggableElement!.style.lineHeight,
			layoutCountAfterToggle: layoutService.layoutCount,
		}, {
			startupState: {
				mainEnabled: true,
				mainTabsEnabled: true,
				mainUppercaseViewHeaders: true,
				auxiliaryEnabled: true,
				auxiliaryTabsEnabled: true,
				auxiliaryUppercaseViewHeaders: true,
				paneHeaderSize: 28,
				paneHeaderLineHeight: '28px',
				paneHeaderInlineLineHeight: '',
				layoutCount: 0,
			},
			mainEnabledAfterToggle: false,
			mainTabsEnabledAfterToggle: false,
			mainUppercaseViewHeadersAfterToggle: false,
			auxiliaryEnabledAfterToggle: false,
			auxiliaryTabsEnabledAfterToggle: false,
			auxiliaryUppercaseViewHeadersAfterToggle: false,
			paneHeaderSizeAfterToggle: 22,
			paneHeaderLineHeightAfterToggle: '22px',
			paneHeaderInlineLineHeightAfterToggle: '',
			layoutCountAfterToggle: 1,
		});
	});

	test('toggles uppercase view headers without relayout', async () => {
		const configurationService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS]: false,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new StyleOverridesTestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		store.add(new StyleOverridesContribution(configurationService, layoutService));

		layoutService.mainContainer.classList.add('monaco-workbench');
		const paneView = appendElement(layoutService.mainContainer, 'monaco-pane-view');
		const paneHeader = appendElement(appendElement(paneView, 'pane'), 'pane-header');
		const paneTitle = appendElement(paneHeader, 'title');

		const explorerPart = appendElement(layoutService.mainContainer, 'part');
		explorerPart.dataset.activeComposite = 'workbench.view.explorer';
		const explorerTitleLabel = appendElement(appendElement(explorerPart, 'title'), 'title-label');
		const explorerTitle = document.createElement('h2');
		explorerTitleLabel.appendChild(explorerTitle);
		const extensionsPart = appendElement(layoutService.mainContainer, 'part');
		const extensionsTitleLabel = appendElement(appendElement(extensionsPart, 'title'), 'title-label');
		const extensionsTitle = document.createElement('h2');
		extensionsTitleLabel.appendChild(extensionsTitle);
		const panelTab = createCompositeAction(layoutService.mainContainer, 35, true).actionLabel;

		document.body.appendChild(layoutService.mainContainer);
		store.add(toDisposable(() => layoutService.mainContainer.remove()));
		const targetWindow = getWindow(layoutService.mainContainer);
		const beforeToggle = {
			classApplied: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneTitleTransform: targetWindow.getComputedStyle(paneTitle).textTransform,
			explorerTitleTransform: targetWindow.getComputedStyle(explorerTitle).textTransform,
			extensionsTitleTransform: targetWindow.getComputedStyle(extensionsTitle).textTransform,
			panelTabTransform: targetWindow.getComputedStyle(panelTab).textTransform,
			layoutCount: layoutService.layoutCount,
		};

		await configurationService.setUserConfiguration(LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS]),
			change: { keys: [LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS], overrides: [] }
		});

		assert.deepStrictEqual({
			beforeToggle,
			classApplied: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneTitleTransform: targetWindow.getComputedStyle(paneTitle).textTransform,
			explorerTitleTransform: targetWindow.getComputedStyle(explorerTitle).textTransform,
			extensionsTitleTransform: targetWindow.getComputedStyle(extensionsTitle).textTransform,
			panelTabTransform: targetWindow.getComputedStyle(panelTab).textTransform,
			layoutCount: layoutService.layoutCount,
		}, {
			beforeToggle: {
				classApplied: false,
				paneTitleTransform: 'capitalize',
				explorerTitleTransform: 'none',
				extensionsTitleTransform: 'capitalize',
				panelTabTransform: 'capitalize',
				layoutCount: 0,
			},
			classApplied: true,
			paneTitleTransform: 'uppercase',
			explorerTitleTransform: 'uppercase',
			extensionsTitleTransform: 'uppercase',
			panelTabTransform: 'uppercase',
			layoutCount: 0,
		});
	});

	test('pane composite actions fill regular and Agents headers', () => {
		const regularRoot = document.createElement('div');
		regularRoot.className = 'monaco-workbench style-override modern-ui-tabs';
		document.body.appendChild(regularRoot);
		store.add(toDisposable(() => regularRoot.remove()));
		// Taller container than the fixed 32px override, so the override is verified rather than a 100% fallback.
		const regular = createCompositeAction(regularRoot, 40, true);
		const regularIcon = createCompositeAction(regularRoot, 40, true, true);
		const regularIconBadge = appendElement(regularIcon.actionItem, 'badge compact');
		const regularIconBadgeContent = appendElement(regularIconBadge, 'badge-content');
		regularIcon.actionItem.insertBefore(regularIconBadge, regularIcon.indicator);

		const agentsRoot = document.createElement('div');
		agentsRoot.className = 'monaco-workbench modern-ui-tabs';
		document.body.appendChild(agentsRoot);
		store.add(toDisposable(() => agentsRoot.remove()));
		const agents = createCompositeAction(agentsRoot, 35, false);
		const agentsIcon = createCompositeAction(agentsRoot, 35, true, true);
		const agentsIconBadge = appendElement(agentsIcon.actionItem, 'badge compact');
		const agentsIconBadgeContent = appendElement(agentsIconBadge, 'badge-content');
		agentsIcon.actionItem.insertBefore(agentsIconBadge, agentsIcon.indicator);

		const targetWindow = getWindow(agents.actionItem);
		const agentsIconTargetBounds = agentsIcon.actionItem.getBoundingClientRect();
		const agentsIconIndicatorBounds = agentsIcon.indicator.getBoundingClientRect();
		assert.deepStrictEqual({
			regularTargetHeight: targetWindow.getComputedStyle(regular.actionItem).height,
			regularIndicatorHeight: targetWindow.getComputedStyle(regular.indicator).height,
			regularIconBadgeTop: targetWindow.getComputedStyle(regularIconBadgeContent).top,
			regularIconBadgeRight: targetWindow.getComputedStyle(regularIconBadgeContent).right,
			agentsTargetHeight: targetWindow.getComputedStyle(agents.actionItem).height,
			agentsIndicatorHeight: targetWindow.getComputedStyle(agents.indicator).height,
			agentsIconTargetHeight: targetWindow.getComputedStyle(agentsIcon.actionItem).height,
			agentsIconIndicatorHeight: targetWindow.getComputedStyle(agentsIcon.indicator).height,
			agentsIconIndicatorTopInset: agentsIconIndicatorBounds.top - agentsIconTargetBounds.top,
			agentsIconIndicatorBottomInset: agentsIconTargetBounds.bottom - agentsIconIndicatorBounds.bottom,
			agentsIconBadgeTop: targetWindow.getComputedStyle(agentsIconBadgeContent).top,
			agentsIconBadgeRight: targetWindow.getComputedStyle(agentsIconBadgeContent).right,
		}, {
			regularTargetHeight: '32px',
			regularIndicatorHeight: '24px',
			regularIconBadgeTop: '13px',
			regularIconBadgeRight: '2px',
			agentsTargetHeight: '35px',
			agentsIndicatorHeight: '24px',
			agentsIconTargetHeight: '35px',
			agentsIconIndicatorHeight: '24px',
			agentsIconIndicatorTopInset: 5.5,
			agentsIconIndicatorBottomInset: 5.5,
			agentsIconBadgeTop: '13px',
			agentsIconBadgeRight: '2px',
		});
	});

	test('pane composite actions use regular label weight', () => {
		const regularRoot = document.createElement('div');
		regularRoot.className = 'monaco-workbench style-override modern-ui-tabs';
		document.body.appendChild(regularRoot);
		store.add(toDisposable(() => regularRoot.remove()));
		const regular = createCompositeAction(regularRoot, 40, true);
		const auxiliary = createCompositeAction(regularRoot, 40, true);
		auxiliary.actionItem.closest('.part')?.classList.add('auxiliarybar');

		const agentsRoot = document.createElement('div');
		agentsRoot.className = 'monaco-workbench modern-ui-tabs';
		document.body.appendChild(agentsRoot);
		store.add(toDisposable(() => agentsRoot.remove()));
		const agents = createCompositeAction(agentsRoot, 35, true);

		const targetWindow = getWindow(regular.actionLabel);
		assert.deepStrictEqual({
			regularLabelWeight: targetWindow.getComputedStyle(regular.actionLabel).fontWeight,
			auxiliaryLabelWeight: targetWindow.getComputedStyle(auxiliary.actionLabel).fontWeight,
			agentsLabelWeight: targetWindow.getComputedStyle(agents.actionLabel).fontWeight,
		}, {
			regularLabelWeight: '400',
			auxiliaryLabelWeight: '400',
			agentsLabelWeight: '400',
		});
	});

	test('pane composite overflow uses the icon foreground', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench style-override modern-ui-tabs';
		root.style.setProperty('--vscode-icon-foreground', '#123456');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const overflow = createCompositeAction(root, 40, false, true);
		overflow.actionLabel.classList.add('codicon', 'codicon-more');
		overflow.actionLabel.style.color = 'rgba(231, 231, 231, 0.6)';

		assert.strictEqual(getWindow(overflow.actionLabel).getComputedStyle(overflow.actionLabel).color, 'rgb(18, 52, 86)');
	});

	test('preserves Modern UI activity badges and horizontal pane dividers', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench style-override modern-ui-tabs';
		root.style.setProperty('--activity-bar-action-height', '36px');
		root.style.setProperty('--activity-bar-width', '36px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const activityBar = appendElement(root, 'activitybar');
		const content = appendElement(activityBar, 'content');
		const compositeBar = appendElement(content, 'composite-bar');
		const actionBar = appendElement(compositeBar, 'monaco-action-bar');
		const actionItem = appendElement(appendElement(actionBar, 'actions-container'), 'action-item');
		appendElement(actionItem, 'action-label codicon');
		const badgeContent = appendElement(appendElement(actionItem, 'badge'), 'badge-content');

		const part = appendElement(root, 'part pane-composite-part');
		const header = appendElement(part, 'header-or-footer header');
		const footer = appendElement(part, 'header-or-footer footer');

		const targetWindow = getWindow(root);
		assert.deepStrictEqual({
			badgeTop: targetWindow.getComputedStyle(badgeContent).top,
			badgeWidth: targetWindow.getComputedStyle(badgeContent).width,
			badgeHeight: targetWindow.getComputedStyle(badgeContent).height,
			headerBorderWidth: targetWindow.getComputedStyle(header).borderBottomWidth,
			headerOverflow: targetWindow.getComputedStyle(header).overflow,
			footerBorderWidth: targetWindow.getComputedStyle(footer).borderTopWidth,
		}, {
			badgeTop: '18px',
			badgeWidth: '16px',
			badgeHeight: '16px',
			headerBorderWidth: '0px',
			headerOverflow: 'visible',
			footerBorderWidth: '0px',
		});
	});

	test('uses the editor surface border color', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench style-override floating-panels';
		root.style.setProperty('--vscode-editor-border', '#123456');
		root.style.setProperty('--vscode-surface-border', '#654321');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const grid = appendElement(root, 'monaco-grid-view');
		const editor = appendElement(grid, 'part editor');
		const contribution = colorRegistry.getColors().find(color => color.id === EDITOR_BORDER);

		assert.deepStrictEqual({
			registeredDefault: contribution?.defaults,
			borderColor: getWindow(editor).getComputedStyle(editor).borderColor,
		}, {
			registeredDefault: SURFACE_BORDER,
			borderColor: 'rgb(18, 52, 86)',
		});
	});

	test('keeps panel global actions above overflowing title actions', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench style-override';
		root.style.setProperty('--vscode-panel-background', '#123456');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const panel = appendElement(root, 'part basepanel bottom');
		const title = appendElement(panel, 'composite title');
		const titleActions = appendElement(title, 'title-actions');
		const globalActions = appendElement(title, 'global-actions');
		const targetWindow = getWindow(root);

		assert.deepStrictEqual({
			titleActionsMinWidth: targetWindow.getComputedStyle(titleActions).minWidth,
			globalActionsPosition: targetWindow.getComputedStyle(globalActions).position,
			globalActionsZIndex: targetWindow.getComputedStyle(globalActions).zIndex,
			globalActionsFlexShrink: targetWindow.getComputedStyle(globalActions).flexShrink,
			globalActionsBackground: targetWindow.getComputedStyle(globalActions).backgroundColor,
		}, {
			titleActionsMinWidth: '0px',
			globalActionsPosition: 'relative',
			globalActionsZIndex: '1',
			globalActionsFlexShrink: '0',
			globalActionsBackground: 'rgb(18, 52, 86)',
		});
	});
});
