/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { Pane } from '../../../../../base/browser/ui/splitview/paneview.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Color } from '../../../../../base/common/color.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpression, ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { editorBackground, Extensions as ColorRegistryExtensions, IColorRegistry, listHoverBackground, listHoverForeground, listInactiveSelectionBackground, listInactiveSelectionForeground, oneOf, opaque } from '../../../../../platform/theme/common/colorRegistry.js';
import { foreground } from '../../../../../platform/theme/common/colors/baseColors.js';
import { Extensions as ThemeServiceExtensions, IThemingRegistry } from '../../../../../platform/theme/common/themeService.js';
import { EDITOR_BORDER, MODERN_ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_BORDER, MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_ACTIVE_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_ACTIVE_FOREGROUND, MODERN_ACTIVITY_BAR_ITEM_HOVER_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_HOVER_FOREGROUND, MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, SURFACE_BORDER, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_BORDER, TAB_ACTIVE_BORDER_TOP, TAB_ACTIVE_FOREGROUND, TAB_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_HOVER_FOREGROUND, TAB_INACTIVE_BACKGROUND, TAB_INACTIVE_FOREGROUND, TAB_LAST_PINNED_BORDER, TAB_SELECTED_BACKGROUND, TAB_UNFOCUSED_HOVER_BACKGROUND } from '../../../../common/theme.js';
import { TestEnvironmentService, TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { LayoutSettings, ModernUIDensity } from '../../../../services/layout/browser/layoutService.js';
import { PRESERVE_MERGED_WORKSPACE_NAME_CASE_CLASS, PRESERVE_WORKSPACE_NAME_CASE_CLASS, shouldPreserveWorkspaceNameCase } from '../../../files/browser/views/explorerView.js';
import { URI } from '../../../../../base/common/uri.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { generateColorThemeCSS } from '../../../../services/themes/browser/colorThemeCss.js';
import '../../../../browser/media/floatingPanels.css';
import '../../../../browser/parts/activitybar/media/activityaction.css';
import '../../../../browser/parts/media/paneCompositePart.css';
import { ModernUIContribution } from '../../browser/modernUI.contribution.js';
import '../../../../browser/parts/notifications/media/notificationsCenter.css';
import '../../../../browser/parts/notifications/media/notificationsToasts.css';

class ModernUITestPane extends Pane {

	constructor() {
		super({ title: 'Test', minimumBodySize: 0, maximumBodySize: 0 });
		this.render();
	}

	protected renderHeader(container: HTMLElement): void { }
	protected renderBody(container: HTMLElement): void { }
	protected layoutBody(height: number, width: number): void { }
}

class ModernUITestLayoutService extends TestLayoutService {

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

function createEditorTabLabel(parent: HTMLElement, extraClasses?: string): { label: HTMLElement; name: HTMLElement; description: HTMLElement } {
	const label = appendElement(parent, `tab-label monaco-icon-label codicon codicon-settings${extraClasses ? ` ${extraClasses}` : ''}`);
	const labelContainer = appendElement(label, 'monaco-icon-label-container');
	const nameContainer = appendElement(labelContainer, 'monaco-icon-name-container');
	const name = document.createElement('a');
	name.className = 'label-name';
	nameContainer.appendChild(name);
	const descriptionContainer = appendElement(labelContainer, 'monaco-icon-description-container');
	const description = document.createElement('span');
	description.className = 'label-description';
	descriptionContainer.appendChild(description);
	return { label, name, description };
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

suite('ModernUIContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const colorRegistry = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution);
	const themingRegistry = Registry.as<IThemingRegistry>(ThemeServiceExtensions.ThemingContribution);

	test('shows layout density options in the Settings menu only when Modern UI is enabled', () => {
		const parent = MenuRegistry.getMenuItems(MenuId.GlobalActivity)
			.filter(isISubmenuItem)
			.find(item => (typeof item.title === 'string' ? item.title : item.title.value) === 'Layout Density');
		const options = parent ? MenuRegistry.getMenuItems(parent.submenu).filter(isIMenuItem) : [];
		const context = (modernUI: boolean, density: ModernUIDensity) => ({
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => (
				key === `config.${LayoutSettings.MODERN_UI}` ? modernUI
					: key === `config.${LayoutSettings.MODERN_UI_DENSITY}` ? density
						: undefined
			) as T,
		});

		assert.deepStrictEqual({
			parent: parent && {
				group: parent.group,
				order: parent.order,
				visibleWhenEnabled: parent.when?.evaluate(context(true, ModernUIDensity.Default)),
				visibleWhenDisabled: parent.when?.evaluate(context(false, ModernUIDensity.Default)),
			},
			options: options.map(item => ({
				title: typeof item.command.title === 'string' ? item.command.title : item.command.title.value,
				checkedForDefault: getToggledExpression(item.command.toggled)?.evaluate(context(true, ModernUIDensity.Default)),
				checkedForCompact: getToggledExpression(item.command.toggled)?.evaluate(context(true, ModernUIDensity.Compact)),
			})),
		}, {
			parent: {
				group: '2_configuration',
				order: 8,
				visibleWhenEnabled: true,
				visibleWhenDisabled: false,
			},
			options: [
				{ title: 'Default', checkedForDefault: true, checkedForCompact: false },
				{ title: 'Compact', checkedForDefault: false, checkedForCompact: true },
			],
		});
	});

	function getToggledExpression(toggled: ContextKeyExpression | { condition: ContextKeyExpression } | undefined): ContextKeyExpression | undefined {
		return toggled ? (toggled as { condition?: ContextKeyExpression }).condition ?? toggled as ContextKeyExpression : undefined;
	}

	test('updates the layout density from the Settings menu', async () => {
		const updates: { key: string; value: unknown }[] = [];
		const updateComplete = new DeferredPromise<void>();
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				updates.push({ key, value });
				return updateComplete.p;
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const parent = MenuRegistry.getMenuItems(MenuId.GlobalActivity)
			.filter(isISubmenuItem)
			.find(item => (typeof item.title === 'string' ? item.title : item.title.value) === 'Layout Density');
		assert.ok(parent);
		const compactOption = MenuRegistry.getMenuItems(parent.submenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.setLayoutDensity.compact');
		assert.ok(compactOption);
		const command = CommandsRegistry.getCommand(compactOption.command.id);
		assert.ok(command);

		let commandCompleted = false;
		const commandCompletion = Promise.resolve(instantiationService.invokeFunction(accessor => command.handler(accessor))).then(() => commandCompleted = true);
		await Promise.resolve();
		const commandCompletedBeforeUpdate = commandCompleted;
		updateComplete.complete();
		await commandCompletion;

		assert.deepStrictEqual({
			updates,
			commandCompletedBeforeUpdate,
			commandCompleted,
		}, {
			updates: [{
				key: LayoutSettings.MODERN_UI_DENSITY,
				value: ModernUIDensity.Compact,
			}],
			commandCompletedBeforeUpdate: false,
			commandCompleted: true,
		});
	});

	test('applies startup density and relayouts when density or enablement changes', async () => {
		const configurationService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[LayoutSettings.MODERN_UI_DENSITY]: ModernUIDensity.Compact,
			[LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS]: true,
		});

		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new ModernUITestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		store.add(new ModernUIContribution(configurationService, layoutService));
		const pane = store.add(new ModernUITestPane());
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
			mainEnabled: layoutService.mainContainer.classList.contains('modern-ui'),
			mainCompact: layoutService.mainContainer.classList.contains('modern-ui-compact'),
			mainTabsEnabled: layoutService.mainContainer.classList.contains('modern-ui-tabs'),
			mainNotificationsDialogsEnabled: layoutService.mainContainer.classList.contains('modern-ui-notifications-dialogs'),
			mainUppercaseViewHeaders: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			auxiliaryEnabled: auxiliaryContainer.classList.contains('modern-ui'),
			auxiliaryCompact: auxiliaryContainer.classList.contains('modern-ui-compact'),
			auxiliaryTabsEnabled: auxiliaryContainer.classList.contains('modern-ui-tabs'),
			auxiliaryNotificationsDialogsEnabled: auxiliaryContainer.classList.contains('modern-ui-notifications-dialogs'),
			auxiliaryUppercaseViewHeaders: auxiliaryContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneHeaderSize: pane.minimumSize,
			paneHeaderLineHeight: getWindow(pane.draggableElement!).getComputedStyle(pane.draggableElement!).lineHeight,
			paneHeaderInlineLineHeight: pane.draggableElement!.style.lineHeight,
			layoutCount: layoutService.layoutCount,
		};

		await configurationService.setUserConfiguration(LayoutSettings.MODERN_UI_DENSITY, ModernUIDensity.Default);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === LayoutSettings.MODERN_UI_DENSITY,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([LayoutSettings.MODERN_UI_DENSITY]),
			change: { keys: [LayoutSettings.MODERN_UI_DENSITY], overrides: [] }
		});
		const defaultDensityState = {
			mainCompact: layoutService.mainContainer.classList.contains('modern-ui-compact'),
			auxiliaryCompact: auxiliaryContainer.classList.contains('modern-ui-compact'),
			paneHeaderSize: pane.minimumSize,
			paneHeaderLineHeight: getWindow(pane.draggableElement!).getComputedStyle(pane.draggableElement!).lineHeight,
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
			defaultDensityState,
			mainEnabledAfterToggle: layoutService.mainContainer.classList.contains('modern-ui'),
			mainCompactAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-compact'),
			mainTabsEnabledAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-tabs'),
			mainNotificationsDialogsEnabledAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-notifications-dialogs'),
			mainUppercaseViewHeadersAfterToggle: layoutService.mainContainer.classList.contains('modern-ui-uppercase-view-headers'),
			auxiliaryEnabledAfterToggle: auxiliaryContainer.classList.contains('modern-ui'),
			auxiliaryCompactAfterToggle: auxiliaryContainer.classList.contains('modern-ui-compact'),
			auxiliaryTabsEnabledAfterToggle: auxiliaryContainer.classList.contains('modern-ui-tabs'),
			auxiliaryNotificationsDialogsEnabledAfterToggle: auxiliaryContainer.classList.contains('modern-ui-notifications-dialogs'),
			auxiliaryUppercaseViewHeadersAfterToggle: auxiliaryContainer.classList.contains('modern-ui-uppercase-view-headers'),
			paneHeaderSizeAfterToggle: pane.minimumSize,
			paneHeaderLineHeightAfterToggle: getWindow(pane.draggableElement!).getComputedStyle(pane.draggableElement!).lineHeight,
			paneHeaderInlineLineHeightAfterToggle: pane.draggableElement!.style.lineHeight,
			layoutCountAfterToggle: layoutService.layoutCount,
		}, {
			startupState: {
				mainEnabled: true,
				mainCompact: true,
				mainTabsEnabled: true,
				mainNotificationsDialogsEnabled: true,
				mainUppercaseViewHeaders: true,
				auxiliaryEnabled: true,
				auxiliaryCompact: true,
				auxiliaryTabsEnabled: true,
				auxiliaryNotificationsDialogsEnabled: true,
				auxiliaryUppercaseViewHeaders: true,
				paneHeaderSize: 28,
				paneHeaderLineHeight: '28px',
				paneHeaderInlineLineHeight: '',
				layoutCount: 0,
			},
			defaultDensityState: {
				mainCompact: false,
				auxiliaryCompact: false,
				paneHeaderSize: 28,
				paneHeaderLineHeight: '28px',
				layoutCount: 1,
			},
			mainEnabledAfterToggle: false,
			mainCompactAfterToggle: false,
			mainTabsEnabledAfterToggle: false,
			mainNotificationsDialogsEnabledAfterToggle: false,
			mainUppercaseViewHeadersAfterToggle: false,
			auxiliaryEnabledAfterToggle: false,
			auxiliaryCompactAfterToggle: false,
			auxiliaryTabsEnabledAfterToggle: false,
			auxiliaryNotificationsDialogsEnabledAfterToggle: false,
			auxiliaryUppercaseViewHeadersAfterToggle: false,
			paneHeaderSizeAfterToggle: 22,
			paneHeaderLineHeightAfterToggle: '22px',
			paneHeaderInlineLineHeightAfterToggle: '',
			layoutCountAfterToggle: 2,
		});
	});

	test('supports isolated notification and dialog presentation', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-notifications-dialogs nostatusbar';
		root.style.setProperty('--vscode-spacing-size20', '2px');
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size60', '6px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-cornerRadius-large', '8px');
		root.style.setProperty('--modern-ui-notifications-inline-inset', '12px');
		root.style.setProperty('--modern-ui-notifications-block-end-inset', '20px');
		root.style.setProperty('--modern-ui-notifications-block-start-inset', '24px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const notificationList = appendElement(root, 'notifications-list-container');
		const notification = appendElement(notificationList, 'notification-list-item');
		const notificationsCenter = appendElement(root, 'notifications-center');
		const centerList = appendElement(notificationsCenter, 'notifications-list-container');
		const centerRow = appendElement(centerList, 'monaco-list-row');
		const topNotificationsCenter = appendElement(root, 'notifications-center top-right');
		const notificationsToasts = appendElement(root, 'notifications-toasts');
		const topNotificationsToasts = appendElement(root, 'notifications-toasts top-right');
		const toastContainer = appendElement(notificationsToasts, 'notification-toast-container');
		const toast = appendElement(toastContainer, 'notification-toast');
		const toastList = appendElement(toast, 'notifications-list-container');
		const toastRow = appendElement(toastList, 'monaco-list-row');
		const dialog = appendElement(root, 'monaco-dialog-box');

		const targetWindow = getWindow(root);
		const notificationStyle = targetWindow.getComputedStyle(notification);
		const notificationsCenterStyle = targetWindow.getComputedStyle(notificationsCenter);
		const centerRowStyle = targetWindow.getComputedStyle(centerRow);
		const topNotificationsCenterStyle = targetWindow.getComputedStyle(topNotificationsCenter);
		const notificationsToastsStyle = targetWindow.getComputedStyle(notificationsToasts);
		const topNotificationsToastsStyle = targetWindow.getComputedStyle(topNotificationsToasts);
		const toastStyle = targetWindow.getComputedStyle(toast);
		const toastRowStyle = targetWindow.getComputedStyle(toastRow);
		const dialogStyle = targetWindow.getComputedStyle(dialog);

		assert.deepStrictEqual({
			notificationPadding: notificationStyle.padding,
			notificationsCenterRight: notificationsCenterStyle.right,
			notificationsCenterBottom: notificationsCenterStyle.bottom,
			notificationsCenterRadius: notificationsCenterStyle.borderRadius,
			centerRowRadius: centerRowStyle.borderRadius,
			topNotificationsCenterTop: topNotificationsCenterStyle.top,
			notificationsToastsRight: notificationsToastsStyle.right,
			notificationsToastsBottom: notificationsToastsStyle.bottom,
			notificationsToastsRadius: notificationsToastsStyle.borderRadius,
			topNotificationsToastsTop: topNotificationsToastsStyle.top,
			toastRadius: toastStyle.borderRadius,
			toastRowRadius: toastRowStyle.borderRadius,
			dialogPadding: dialogStyle.padding,
			dialogMinWidth: dialogStyle.minWidth,
		}, {
			notificationPadding: '6px 2px',
			notificationsCenterRight: '12px',
			notificationsCenterBottom: '20px',
			notificationsCenterRadius: '8px',
			centerRowRadius: '0px 0px 8px 8px',
			topNotificationsCenterTop: '24px',
			notificationsToastsRight: '8px',
			notificationsToastsBottom: '16px',
			notificationsToastsRadius: '8px',
			topNotificationsToastsTop: '20px',
			toastRadius: '8px',
			toastRowRadius: '8px',
			dialogPadding: '4px',
			dialogMinWidth: '440px',
		});
	});

	test('uses part-specific pane colors and only draws panel header separators in vertical layouts', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui';
		root.style.setProperty('--vscode-sideBar-background', '#FF8888');
		root.style.setProperty('--vscode-sideBarSectionHeader-border', '#FF0000');
		root.style.setProperty('--vscode-panel-background', '#8888FF');
		root.style.setProperty('--vscode-panelSectionHeader-border', '#0000FF');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const sideBarPaneView = appendElement(appendElement(root, 'part sidebar'), 'monaco-pane-view');
		const firstSideBarPane = store.add(new ModernUITestPane());
		appendElement(sideBarPaneView, 'split-view-view').appendChild(firstSideBarPane.element);

		const followingSideBarPane = store.add(new ModernUITestPane());
		appendElement(sideBarPaneView, 'split-view-view').appendChild(followingSideBarPane.element);

		const panel = appendElement(root, 'part panel');
		const verticalPaneView = appendElement(panel, 'monaco-pane-view');
		const firstVerticalPane = store.add(new ModernUITestPane());
		firstVerticalPane.style({
			dropBackground: undefined,
			headerForeground: undefined,
			headerBackground: '#FFFFFF',
			headerBorder: '#00FF00',
			leftBorder: undefined,
		});
		appendElement(verticalPaneView, 'split-view-view').appendChild(firstVerticalPane.element);

		const followingVerticalPane = store.add(new ModernUITestPane());
		followingVerticalPane.style({
			dropBackground: undefined,
			headerForeground: undefined,
			headerBackground: '#FFFFFF',
			headerBorder: '#00FF00',
			leftBorder: undefined,
		});
		appendElement(verticalPaneView, 'split-view-view').appendChild(followingVerticalPane.element);

		const horizontalPaneView = appendElement(panel, 'monaco-pane-view');
		const firstHorizontalPane = store.add(new ModernUITestPane());
		firstHorizontalPane.orientation = Orientation.HORIZONTAL;
		firstHorizontalPane.style({
			dropBackground: undefined,
			headerForeground: undefined,
			headerBackground: undefined,
			headerBorder: undefined,
			leftBorder: '#FF0000',
		});
		appendElement(horizontalPaneView, 'split-view-view').appendChild(firstHorizontalPane.element);

		const followingHorizontalPane = store.add(new ModernUITestPane());
		followingHorizontalPane.orientation = Orientation.HORIZONTAL;
		followingHorizontalPane.style({
			dropBackground: undefined,
			headerForeground: undefined,
			headerBackground: undefined,
			headerBorder: undefined,
			leftBorder: '#FF0000',
		});
		appendElement(horizontalPaneView, 'split-view-view').appendChild(followingHorizontalPane.element);

		const targetWindow = getWindow(root);
		assert.deepStrictEqual({
			sideBarPaneBackground: targetWindow.getComputedStyle(followingSideBarPane.element).backgroundColor,
			sideBarHeaderBackground: targetWindow.getComputedStyle(followingSideBarPane.draggableElement!).backgroundColor,
			sideBarHeaderSeparatorColor: targetWindow.getComputedStyle(followingSideBarPane.draggableElement!, '::before').backgroundColor,
			panelPaneBackground: targetWindow.getComputedStyle(followingVerticalPane.element).backgroundColor,
			panelHeaderBackground: targetWindow.getComputedStyle(followingVerticalPane.draggableElement!).backgroundColor,
			panelHeaderSeparatorColor: targetWindow.getComputedStyle(followingVerticalPane.draggableElement!, '::before').backgroundColor,
			firstVerticalHeaderSeparatorVisible: targetWindow.getComputedStyle(firstVerticalPane.draggableElement!, '::before').display !== 'none',
			followingVerticalHeaderSeparatorVisible: targetWindow.getComputedStyle(followingVerticalPane.draggableElement!, '::before').display !== 'none',
			followingVerticalHeaderBorderTopWidth: targetWindow.getComputedStyle(followingVerticalPane.draggableElement!).borderTopWidth,
			firstHorizontalHeaderSeparatorVisible: targetWindow.getComputedStyle(firstHorizontalPane.draggableElement!, '::before').display !== 'none',
			followingHorizontalHeaderSeparatorVisible: targetWindow.getComputedStyle(followingHorizontalPane.draggableElement!, '::before').display !== 'none',
			followingHorizontalPaneBorderLeftWidth: targetWindow.getComputedStyle(followingHorizontalPane.element).borderLeftWidth,
			followingHorizontalPaneBorderLeftColor: targetWindow.getComputedStyle(followingHorizontalPane.element).borderLeftColor,
		}, {
			sideBarPaneBackground: 'rgb(255, 136, 136)',
			sideBarHeaderBackground: 'rgb(255, 136, 136)',
			sideBarHeaderSeparatorColor: 'rgb(255, 0, 0)',
			panelPaneBackground: 'rgb(136, 136, 255)',
			panelHeaderBackground: 'rgb(136, 136, 255)',
			panelHeaderSeparatorColor: 'rgb(0, 0, 255)',
			firstVerticalHeaderSeparatorVisible: false,
			followingVerticalHeaderSeparatorVisible: true,
			followingVerticalHeaderBorderTopWidth: '0px',
			firstHorizontalHeaderSeparatorVisible: false,
			followingHorizontalHeaderSeparatorVisible: false,
			followingHorizontalPaneBorderLeftWidth: '1px',
			followingHorizontalPaneBorderLeftColor: 'rgb(255, 0, 0)',
		});
	});

	test('toggles uppercase view headers without relayout', async () => {
		const configurationService = new TestConfigurationService({
			[LayoutSettings.MODERN_UI]: true,
			[LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS]: false,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new ModernUITestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		store.add(new ModernUIContribution(configurationService, layoutService));

		layoutService.mainContainer.classList.add('monaco-workbench');
		const paneView = appendElement(layoutService.mainContainer, 'monaco-pane-view');
		const paneHeader = appendElement(appendElement(paneView, 'pane'), 'pane-header');
		const paneTitle = appendElement(paneHeader, 'title');

		const explorerPart = appendElement(layoutService.mainContainer, `part ${PRESERVE_MERGED_WORKSPACE_NAME_CASE_CLASS}`);
		explorerPart.dataset.activeComposite = 'workbench.views.service.sidebar.custom';
		const explorerTitleLabel = appendElement(appendElement(explorerPart, 'title'), 'title-label');
		const explorerTitle = document.createElement('h2');
		explorerTitleLabel.appendChild(explorerTitle);
		const explorerPaneHeader = appendElement(appendElement(appendElement(explorerPart, 'monaco-pane-view'), `pane ${PRESERVE_WORKSPACE_NAME_CASE_CLASS}`), 'pane-header');
		appendElement(explorerPaneHeader, 'icon codicon-explorer-view-icon');
		const explorerPaneTitle = appendElement(explorerPaneHeader, 'title');
		const multiViewPart = appendElement(layoutService.mainContainer, 'part');
		multiViewPart.dataset.activeComposite = 'workbench.views.service.sidebar.multiView';
		const multiViewTitleLabel = appendElement(appendElement(multiViewPart, 'title'), 'title-label');
		const multiViewTitle = document.createElement('h2');
		multiViewTitleLabel.appendChild(multiViewTitle);
		const multiViewExplorerPaneHeader = appendElement(appendElement(appendElement(multiViewPart, 'monaco-pane-view'), `pane ${PRESERVE_WORKSPACE_NAME_CASE_CLASS}`), 'pane-header');
		appendElement(multiViewExplorerPaneHeader, 'icon codicon-explorer-view-icon');
		const multiViewExplorerPaneTitle = appendElement(multiViewExplorerPaneHeader, 'title');
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
			explorerPaneTitleTransform: targetWindow.getComputedStyle(explorerPaneTitle).textTransform,
			multiViewTitleTransform: targetWindow.getComputedStyle(multiViewTitle).textTransform,
			multiViewExplorerPaneTitleTransform: targetWindow.getComputedStyle(multiViewExplorerPaneTitle).textTransform,
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
			explorerPaneTitleTransform: targetWindow.getComputedStyle(explorerPaneTitle).textTransform,
			multiViewTitleTransform: targetWindow.getComputedStyle(multiViewTitle).textTransform,
			multiViewExplorerPaneTitleTransform: targetWindow.getComputedStyle(multiViewExplorerPaneTitle).textTransform,
			extensionsTitleTransform: targetWindow.getComputedStyle(extensionsTitle).textTransform,
			panelTabTransform: targetWindow.getComputedStyle(panelTab).textTransform,
			layoutCount: layoutService.layoutCount,
		}, {
			beforeToggle: {
				classApplied: false,
				paneTitleTransform: 'capitalize',
				explorerTitleTransform: 'none',
				explorerPaneTitleTransform: 'none',
				multiViewTitleTransform: 'capitalize',
				multiViewExplorerPaneTitleTransform: 'none',
				extensionsTitleTransform: 'capitalize',
				panelTabTransform: 'capitalize',
				layoutCount: 0,
			},
			classApplied: true,
			paneTitleTransform: 'uppercase',
			explorerTitleTransform: 'uppercase',
			explorerPaneTitleTransform: 'uppercase',
			multiViewTitleTransform: 'uppercase',
			multiViewExplorerPaneTitleTransform: 'uppercase',
			extensionsTitleTransform: 'uppercase',
			panelTabTransform: 'uppercase',
			layoutCount: 0,
		});
	});

	test('Explorer title casing follows the workspace name decision', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui';

		function createExplorerTitles(workbenchState: WorkbenchState, configuration: URI | null) {
			const preserveCase = shouldPreserveWorkspaceNameCase(workbenchState, { id: 'test', folders: [], configuration }, TestEnvironmentService);
			const part = appendElement(root, preserveCase ? `part ${PRESERVE_MERGED_WORKSPACE_NAME_CASE_CLASS}` : 'part');
			const mergedTitle = document.createElement('h2');
			appendElement(appendElement(part, 'title'), 'title-label').appendChild(mergedTitle);
			const paneHeader = appendElement(appendElement(appendElement(part, 'monaco-pane-view'), preserveCase ? `pane ${PRESERVE_WORKSPACE_NAME_CASE_CLASS}` : 'pane'), 'pane-header');
			appendElement(paneHeader, 'icon codicon-explorer-view-icon');
			const paneTitle = appendElement(paneHeader, 'title');
			return { mergedTitle, paneTitle };
		}

		const untitled = createExplorerTitles(WorkbenchState.WORKSPACE, joinPath(TestEnvironmentService.untitledWorkspacesHome, '1234', 'workspace.json'));
		const named = createExplorerTitles(WorkbenchState.WORKSPACE, URI.file('/some/path/myWorkspace.code-workspace'));
		const folder = createExplorerTitles(WorkbenchState.FOLDER, null);

		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const targetWindow = getWindow(root);
		const transforms = () => ({
			untitledMerged: targetWindow.getComputedStyle(untitled.mergedTitle).textTransform,
			untitledPane: targetWindow.getComputedStyle(untitled.paneTitle).textTransform,
			namedMerged: targetWindow.getComputedStyle(named.mergedTitle).textTransform,
			namedPane: targetWindow.getComputedStyle(named.paneTitle).textTransform,
			folderMerged: targetWindow.getComputedStyle(folder.mergedTitle).textTransform,
			folderPane: targetWindow.getComputedStyle(folder.paneTitle).textTransform,
		});

		const defaultTransforms = transforms();
		root.classList.add('modern-ui-uppercase-view-headers');

		assert.deepStrictEqual({
			defaultTransforms,
			uppercaseTransforms: transforms(),
		}, {
			defaultTransforms: {
				untitledMerged: 'capitalize',
				untitledPane: 'capitalize',
				namedMerged: 'none',
				namedPane: 'none',
				folderMerged: 'none',
				folderPane: 'none',
			},
			uppercaseTransforms: {
				untitledMerged: 'uppercase',
				untitledPane: 'uppercase',
				namedMerged: 'uppercase',
				namedPane: 'uppercase',
				folderMerged: 'uppercase',
				folderPane: 'uppercase',
			},
		});
	});

	test('pane composite actions fill regular and Agents headers', () => {
		const regularRoot = document.createElement('div');
		regularRoot.className = 'monaco-workbench modern-ui modern-ui-tabs';
		document.body.appendChild(regularRoot);
		store.add(toDisposable(() => regularRoot.remove()));
		// Taller container than the fixed 32px Modern UI height, so the fixed height is verified rather than a 100% fallback.
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

	test('panel title tabs drop the classic 1px title border so the 32px pills center in the 32px bar', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const { actionItem } = createCompositeAction(root, 32, true);
		actionItem.closest('.part')?.classList.add('panel', 'basepanel', 'bottom');
		actionItem.closest('.title')?.classList.add('composite', 'has-composite-bar');

		const title = actionItem.closest('.title')!;
		const classicBorder = document.createElement('style');
		classicBorder.textContent = '.monaco-workbench .part.panel.bottom .composite.title { border-top: 1px solid; }';
		root.prepend(classicBorder);
		const targetWindow = getWindow(title);
		// Assert only what this fix owns; other layout values would be brittle.
		assert.deepStrictEqual({
			titleBorderTopWidth: targetWindow.getComputedStyle(title).borderTopWidth,
			titleBorderTopStyle: targetWindow.getComputedStyle(title).borderTopStyle,
			actionItemBorderTop: targetWindow.getComputedStyle(actionItem).borderTopWidth,
		}, {
			titleBorderTopWidth: '0px',
			titleBorderTopStyle: 'none',
			actionItemBorderTop: '4px',
		});
	});

	test('pane composite actions use regular label weight', () => {
		const regularRoot = document.createElement('div');
		regularRoot.className = 'monaco-workbench modern-ui modern-ui-tabs';
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
		root.className = 'monaco-workbench modern-ui modern-ui-tabs';
		root.style.setProperty('--vscode-icon-foreground', '#123456');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const overflow = createCompositeAction(root, 40, false, true);
		overflow.actionLabel.classList.add('codicon', 'codicon-more');
		overflow.actionLabel.style.color = 'rgba(231, 231, 231, 0.6)';

		assert.strictEqual(getWindow(overflow.actionLabel).getComputedStyle(overflow.actionLabel).color, 'rgb(18, 52, 86)');
	});

	test('preserves Modern UI activity indicators, badges and horizontal pane dividers', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-tabs';
		root.style.setProperty('--activity-bar-action-height', '36px');
		root.style.setProperty('--activity-bar-width', '36px');
		root.style.setProperty('--vscode-cornerRadius-small', '4px');
		root.style.setProperty('--vscode-modernActivityBarItem-activeBackground', '#123456');
		root.style.setProperty('--vscode-modernActivityBarItem-activeForeground', '#abcdef');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const activityBar = appendElement(root, 'activitybar');
		const content = appendElement(activityBar, 'content');
		const compositeBar = appendElement(content, 'composite-bar');
		const actionBar = appendElement(compositeBar, 'monaco-action-bar');
		const actionItem = appendElement(appendElement(actionBar, 'actions-container'), 'action-item checked');
		const activityLabel = appendElement(actionItem, 'action-label codicon');
		const indicator = appendElement(actionItem, 'active-item-indicator');
		const badgeContent = appendElement(appendElement(actionItem, 'badge'), 'badge-content');
		const agentsRoot = document.createElement('div');
		agentsRoot.className = 'monaco-workbench modern-ui-tabs';
		agentsRoot.style.setProperty('--vscode-modernTab-activeBackground', '#654321');
		agentsRoot.style.setProperty('--vscode-modernTab-activeForeground', '#fedcba');
		document.body.appendChild(agentsRoot);
		store.add(toDisposable(() => agentsRoot.remove()));
		const horizontalAction = createCompositeAction(agentsRoot, 35, true, true);
		horizontalAction.actionLabel.classList.add('codicon');

		const part = appendElement(root, 'part pane-composite-part');
		const header = appendElement(part, 'header-or-footer header');
		const footer = appendElement(part, 'header-or-footer footer');

		const targetWindow = getWindow(root);
		assert.deepStrictEqual({
			activityColorsRegistered: [MODERN_ACTIVITY_BAR_BACKGROUND, MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_ACTIVE_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_ACTIVE_FOREGROUND, MODERN_ACTIVITY_BAR_ITEM_HOVER_BACKGROUND, MODERN_ACTIVITY_BAR_ITEM_HOVER_FOREGROUND].map(id => colorRegistry.getColors().some(color => color.id === id)),
			indicatorBackground: targetWindow.getComputedStyle(indicator).backgroundColor,
			activityLabelColor: targetWindow.getComputedStyle(activityLabel).color,
			horizontalIndicatorBackground: targetWindow.getComputedStyle(horizontalAction.indicator).backgroundColor,
			horizontalLabelColor: targetWindow.getComputedStyle(horizontalAction.actionLabel).color,
			indicatorWidth: targetWindow.getComputedStyle(indicator).width,
			indicatorHeight: targetWindow.getComputedStyle(indicator).height,
			indicatorBorderRadius: targetWindow.getComputedStyle(indicator).borderRadius,
			badgeTop: targetWindow.getComputedStyle(badgeContent).top,
			badgeWidth: targetWindow.getComputedStyle(badgeContent).width,
			badgeHeight: targetWindow.getComputedStyle(badgeContent).height,
			headerBorderWidth: targetWindow.getComputedStyle(header).borderBottomWidth,
			headerOverflow: targetWindow.getComputedStyle(header).overflow,
			footerBorderWidth: targetWindow.getComputedStyle(footer).borderTopWidth,
		}, {
			activityColorsRegistered: [true, true, true, true, true, true],
			indicatorBackground: 'rgb(18, 52, 86)',
			activityLabelColor: 'rgb(171, 205, 239)',
			horizontalIndicatorBackground: 'rgb(101, 67, 33)',
			horizontalLabelColor: 'rgb(254, 220, 186)',
			indicatorWidth: '32px',
			indicatorHeight: '32px',
			indicatorBorderRadius: '4px',
			badgeTop: '18px',
			badgeWidth: '16px',
			badgeHeight: '16px',
			headerBorderWidth: '0px',
			headerOverflow: 'visible',
			footerBorderWidth: '0px',
		});
	});

	test('centers activity bar items within floating navigation rails', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-compact floating-panels';
		root.style.display = 'inline-flex';
		root.style.setProperty('--activity-bar-action-height', '36px');
		root.style.setProperty('--activity-bar-width', '36px');
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-sizeNone', '0px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const leftActivityBar = appendElement(root, 'part activitybar left');
		const leftContent = appendElement(leftActivityBar, 'content');
		const leftActionBar = appendElement(appendElement(leftContent, 'composite-bar'), 'monaco-action-bar');
		const leftAction = appendElement(leftActionBar, 'action-item checked');
		appendElement(leftAction, 'action-label codicon');
		const leftIndicator = appendElement(leftAction, 'active-item-indicator');
		const leftSideBar = appendElement(root, 'part sidebar');
		leftSideBar.style.width = '60px';

		const rightSideBar = appendElement(root, 'part sidebar');
		rightSideBar.style.width = '60px';
		const rightActivityBar = appendElement(root, 'part activitybar right');
		const rightContent = appendElement(rightActivityBar, 'content');
		const rightActionBar = appendElement(appendElement(rightContent, 'composite-bar'), 'monaco-action-bar');
		const rightAction = appendElement(rightActionBar, 'action-item checked');
		appendElement(rightAction, 'action-label codicon');
		const rightIndicator = appendElement(rightAction, 'active-item-indicator');

		const leftActivityBounds = leftActivityBar.getBoundingClientRect();
		const leftActionBounds = leftAction.getBoundingClientRect();
		const leftSideBarBounds = leftSideBar.getBoundingClientRect();
		const leftIndicatorBounds = leftIndicator.getBoundingClientRect();
		const rightSideBarBounds = rightSideBar.getBoundingClientRect();
		const rightActionBounds = rightAction.getBoundingClientRect();
		const rightIndicatorBounds = rightIndicator.getBoundingClientRect();
		const rightActivityBounds = rightActivityBar.getBoundingClientRect();
		const rootBounds = root.getBoundingClientRect();

		assert.deepStrictEqual({
			left: {
				actionWidth: leftActionBounds.width,
				actionCenterOffset: leftActionBounds.left + leftActionBounds.width / 2 - (leftActivityBounds.left + leftActivityBounds.width / 2),
				windowMargin: leftActivityBounds.left - rootBounds.left,
				panelGap: leftSideBarBounds.left - leftActivityBounds.right,
				indicatorPanelPadding: leftSideBarBounds.left - leftIndicatorBounds.right,
			},
			right: {
				actionWidth: rightActionBounds.width,
				actionCenterOffset: rightActionBounds.left + rightActionBounds.width / 2 - (rightActivityBounds.left + rightActivityBounds.width / 2),
				windowMargin: rootBounds.right - rightActivityBounds.right,
				panelGap: rightActivityBounds.left - rightSideBarBounds.right,
				indicatorPanelPadding: rightIndicatorBounds.left - rightSideBarBounds.right,
			},
		}, {
			left: {
				actionWidth: 36,
				actionCenterOffset: 0,
				windowMargin: 4,
				panelGap: 0,
				indicatorPanelPadding: 4,
			},
			right: {
				actionWidth: 36,
				actionCenterOffset: 0,
				windowMargin: 4,
				panelGap: 0,
				indicatorPanelPadding: 4,
			},
		});
	});

	test('centers default density activity bar items and meets the side bar flush', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui floating-panels';
		root.style.display = 'inline-flex';
		root.style.setProperty('--activity-bar-action-height', '36px');
		root.style.setProperty('--activity-bar-width', '36px');
		root.style.setProperty('--vscode-spacing-sizeNone', '0px');
		root.style.setProperty('--vscode-spacing-size20', '2px');
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size60', '6px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const appendActivityAction = (position: 'left' | 'right') => {
			const activityBar = appendElement(root, `part activitybar ${position}`);
			const content = appendElement(activityBar, 'content');
			const actionBar = appendElement(appendElement(content, 'composite-bar'), 'monaco-action-bar');
			const action = appendElement(actionBar, 'action-item checked');
			appendElement(action, 'action-label codicon');
			return { activityBar, action };
		};

		const left = appendActivityAction('left');
		const leftSideBar = appendElement(root, 'part sidebar left');
		leftSideBar.style.width = '60px';
		const rightSideBar = appendElement(root, 'part sidebar right');
		rightSideBar.style.width = '60px';
		const right = appendActivityAction('right');

		const rootBounds = root.getBoundingClientRect();
		const leftActivityBounds = left.activityBar.getBoundingClientRect();
		const leftActionBounds = left.action.getBoundingClientRect();
		const leftSideBarBounds = leftSideBar.getBoundingClientRect();
		const rightSideBarBounds = rightSideBar.getBoundingClientRect();
		const rightActivityBounds = right.activityBar.getBoundingClientRect();
		const rightActionBounds = right.action.getBoundingClientRect();

		assert.deepStrictEqual({
			left: {
				actionWidth: leftActionBounds.width,
				actionCenterOffset: leftActionBounds.left + leftActionBounds.width / 2 - (leftActivityBounds.left + leftActivityBounds.width / 2),
				windowMargin: leftActivityBounds.left - rootBounds.left,
				seamGap: leftSideBarBounds.left - leftActivityBounds.right,
			},
			right: {
				actionWidth: rightActionBounds.width,
				actionCenterOffset: rightActionBounds.left + rightActionBounds.width / 2 - (rightActivityBounds.left + rightActivityBounds.width / 2),
				windowMargin: rootBounds.right - rightActivityBounds.right,
				seamGap: rightActivityBounds.left - rightSideBarBounds.right,
			},
			railWidths: [leftActivityBounds.width, rightActivityBounds.width],
		}, {
			// The rail carries the cluster's 4px perimeter gutter on the window side, meets the
			// side bar flush on the other, and centers the icon column in its own 8px lane —
			// which is independent of the gutter, so the card stays 44px wide.
			left: { actionWidth: 36, actionCenterOffset: 0, windowMargin: 4, seamGap: 0 },
			right: { actionWidth: 36, actionCenterOffset: 0, windowMargin: 4, seamGap: 0 },
			railWidths: [44, 44],
		});
	});

	test('uses the editor surface border color', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui floating-panels';
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

	test('uses the modern activity bar border color', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui floating-panels';
		root.style.setProperty('--vscode-modernActivityBar-border', '#123456');
		root.style.setProperty('--vscode-surface-border', '#654321');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const grid = appendElement(root, 'monaco-grid-view');
		const activityBar = appendElement(grid, 'part activitybar left');
		const sideBar = appendElement(grid, 'part sidebar left');
		const contribution = colorRegistry.getColors().find(color => color.id === MODERN_ACTIVITY_BAR_BORDER);

		assert.deepStrictEqual({
			registeredDefault: contribution?.defaults,
			activityBarBorder: getWindow(activityBar).getComputedStyle(activityBar).borderColor,
			// The other cards keep the shared surface border, minus the edge they give up
			// to the rail as the shared seam.
			sideBarBorder: getWindow(sideBar).getComputedStyle(sideBar).borderColor,
		}, {
			registeredDefault: SURFACE_BORDER,
			activityBarBorder: 'rgb(18, 52, 86)',
			sideBarBorder: 'rgb(101, 67, 33) rgb(101, 67, 33) rgb(101, 67, 33) rgba(0, 0, 0, 0)',
		});
	});

	test('uses opaque surface border defaults', () => {
		const darkTheme = ColorThemeData.createUnloadedTheme('vs-dark');
		const lightTheme = ColorThemeData.createUnloadedTheme('vs');
		const darkSurfaceBorder = darkTheme.getColor(SURFACE_BORDER);
		const darkEditorBorder = darkTheme.getColor(EDITOR_BORDER);
		const lightSurfaceBorder = lightTheme.getColor(SURFACE_BORDER);
		const lightEditorBorder = lightTheme.getColor(EDITOR_BORDER);

		assert.deepStrictEqual({
			darkSurfaceBorderIsOpaque: darkSurfaceBorder?.isOpaque(),
			darkEditorBorderIsOpaque: darkEditorBorder?.isOpaque(),
			darkEditorBorderMatchesSurface: darkEditorBorder?.equals(darkSurfaceBorder ?? null),
			lightSurfaceBorderIsOpaque: lightSurfaceBorder?.isOpaque(),
			lightEditorBorderIsOpaque: lightEditorBorder?.isOpaque(),
			lightEditorBorderMatchesSurface: lightEditorBorder?.equals(lightSurfaceBorder ?? null),
		}, {
			darkSurfaceBorderIsOpaque: true,
			darkEditorBorderIsOpaque: true,
			darkEditorBorderMatchesSurface: true,
			lightSurfaceBorderIsOpaque: true,
			lightEditorBorderIsOpaque: true,
			lightEditorBorderMatchesSurface: true,
		});
	});

	test('inherits the customized activity bar background when inactive', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark');
		theme.setCustomColors({ [MODERN_ACTIVITY_BAR_BACKGROUND]: '#123456' });

		assert.deepStrictEqual({
			background: theme.getColor(MODERN_ACTIVITY_BAR_BACKGROUND)?.toString(),
			inactiveBackground: theme.getColor(MODERN_ACTIVITY_BAR_INACTIVE_BACKGROUND)?.toString(),
		}, {
			background: '#123456',
			inactiveBackground: '#123456',
		});
	});

	test('supports deprecated modern activity bar item colors', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark');
		const deprecatedColorIds = [
			'modernActivityBar.activeBackground',
			'modernActivityBar.activeForeground',
			'modernActivityBar.hoverBackground',
			'modernActivityBar.hoverForeground',
		];
		theme.setCustomColors({
			[deprecatedColorIds[0]]: '#112233',
			[deprecatedColorIds[1]]: '#223344',
			[deprecatedColorIds[2]]: '#334455',
			[deprecatedColorIds[3]]: '#445566',
		});

		const itemColorIds = [
			MODERN_ACTIVITY_BAR_ITEM_ACTIVE_BACKGROUND,
			MODERN_ACTIVITY_BAR_ITEM_ACTIVE_FOREGROUND,
			MODERN_ACTIVITY_BAR_ITEM_HOVER_BACKGROUND,
			MODERN_ACTIVITY_BAR_ITEM_HOVER_FOREGROUND,
		];
		assert.deepStrictEqual({
			itemColorIds,
			resolvedColors: itemColorIds.map(id => theme.getColor(id)?.toString()),
			deprecated: deprecatedColorIds.map(id => Boolean(colorRegistry.getColors().find(color => color.id === id)?.deprecationMessage)),
		}, {
			itemColorIds: [
				'modernActivityBarItem.activeBackground',
				'modernActivityBarItem.activeForeground',
				'modernActivityBarItem.hoverBackground',
				'modernActivityBarItem.hoverForeground',
			],
			resolvedColors: ['#112233', '#223344', '#334455', '#445566'],
			deprecated: [true, true, true, true],
		});
	});

	test('keeps collapsed primary side bar grips only while the activity bar can anchor them', () => {
		const grips = (rootClassName: string) => {
			const root = document.createElement('div');
			root.className = rootClassName;
			document.body.appendChild(root);
			store.add(toDisposable(() => root.remove()));

			const leftPrimarySideBarSash = appendElement(root, 'monaco-sash vertical minimum primary-sidebar-sash');
			const rightPrimarySideBarSash = appendElement(root, 'monaco-sash vertical maximum primary-sidebar-sash');
			const minimumAuxiliaryBarSash = appendElement(root, 'monaco-sash vertical minimum');
			const maximumAuxiliaryBarSash = appendElement(root, 'monaco-sash vertical maximum');
			const panelSash = appendElement(root, 'monaco-sash horizontal maximum');
			const targetWindow = getWindow(root);

			return {
				leftPrimarySideBarGrip: targetWindow.getComputedStyle(leftPrimarySideBarSash, '::after').content,
				rightPrimarySideBarGrip: targetWindow.getComputedStyle(rightPrimarySideBarSash, '::after').content,
				minimumAuxiliaryBarGrip: targetWindow.getComputedStyle(minimumAuxiliaryBarSash, '::after').content,
				maximumAuxiliaryBarGrip: targetWindow.getComputedStyle(maximumAuxiliaryBarSash, '::after').content,
				panelGrip: targetWindow.getComputedStyle(panelSash, '::after').content,
			};
		};

		assert.deepStrictEqual({
			// The rail stands alone as its own card, so the reveal sash sits in a real gap.
			activityBarVisible: grips('monaco-workbench modern-ui nosidebar nopanel'),
			// Nothing left on that edge to gap against.
			activityBarHidden: grips('monaco-workbench modern-ui nosidebar noactivitybar nopanel'),
		}, {
			activityBarVisible: {
				leftPrimarySideBarGrip: '\"\"',
				rightPrimarySideBarGrip: '\"\"',
				minimumAuxiliaryBarGrip: '\"\"',
				maximumAuxiliaryBarGrip: '\"\"',
				panelGrip: 'none',
			},
			activityBarHidden: {
				leftPrimarySideBarGrip: 'none',
				rightPrimarySideBarGrip: 'none',
				minimumAuxiliaryBarGrip: '\"\"',
				maximumAuxiliaryBarGrip: '\"\"',
				panelGrip: 'none',
			},
		});
	});

	test('compact density hides sash grips', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-compact';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const verticalSash = appendElement(root, 'monaco-sash vertical');
		const horizontalSash = appendElement(root, 'monaco-sash horizontal');
		const targetWindow = getWindow(root);

		assert.deepStrictEqual({
			verticalGrip: targetWindow.getComputedStyle(verticalSash, '::after').content,
			horizontalGrip: targetWindow.getComputedStyle(horizontalSash, '::after').content,
		}, {
			verticalGrip: 'none',
			horizontalGrip: 'none',
		});
	});

	test('compact vertical sash highlights meet the attached panel top', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-compact floating-panels';
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-sizeNone', '0px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const verticalSash = appendElement(root, 'monaco-sash vertical');
		const targetWindow = getWindow(root);
		const attachedStyle = targetWindow.getComputedStyle(verticalSash, '::before');
		const attachedInsets = [attachedStyle.top, attachedStyle.bottom];

		root.classList.add('top-window-edge');
		const exposedStyle = targetWindow.getComputedStyle(verticalSash, '::before');

		assert.deepStrictEqual({
			attachedInsets,
			exposedTopInset: exposedStyle.top,
		}, {
			attachedInsets: ['0px', '4px'],
			exposedTopInset: '4px',
		});
	});

	test('default density top panel keeps the outer bottom gutter when maximized', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui floating-panels';
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-sizeNone', '0px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const panel = appendElement(root, 'part panel top');
		const maximizedPanel = appendElement(root, 'part panel top floating-part-outer-bottom');
		const targetWindow = getWindow(root);

		assert.deepStrictEqual({
			panelBottomMargin: targetWindow.getComputedStyle(panel).marginBottom,
			maximizedPanelBottomMargin: targetWindow.getComputedStyle(maximizedPanel).marginBottom,
		}, {
			panelBottomMargin: '0px',
			maximizedPanelBottomMargin: '4px',
		});
	});

	test('compact auxiliary window editors keep their outer radius', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-compact';
		root.style.setProperty('--vscode-cornerRadius-large', '8px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const grid = appendElement(root, 'monaco-grid-view');
		const editor = appendElement(grid, 'part editor');

		assert.deepStrictEqual(getWindow(editor).getComputedStyle(editor).borderRadius, '8px');
	});

	test('compact density rounds only the panel cluster exterior', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui modern-ui-compact floating-panels';
		root.style.setProperty('--vscode-cornerRadius-large', '8px');
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-sizeNone', '0px');
		root.style.setProperty('--vscode-strokeThickness', '1px');
		root.style.setProperty('--vscode-surface-border', '#123456');
		root.style.setProperty('--vscode-editor-border', '#654321');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const grid = appendElement(root, 'monaco-grid-view');
		const activityBar = appendElement(grid, 'part activitybar left');
		const sideBar = appendElement(grid, 'part sidebar floating-part-outer-left floating-part-outer-top floating-part-outer-bottom');
		const panel = appendElement(grid, 'part panel');
		const auxiliaryBar = appendElement(grid, 'part auxiliarybar floating-part-outer-right floating-part-outer-top floating-part-outer-bottom');
		const editor = appendElement(grid, 'part editor floating-editor-outer-left floating-editor-outer-top');
		const editorContent = appendElement(editor, 'content');
		const webviewOverlayContent = appendElement(root, 'webview-overlay-content webview-overlay-outer-left webview-overlay-outer-top');
		const modalWebviewOverlayContent = appendElement(root, 'webview-overlay-content webview-overlay-modal');
		const targetWindow = getWindow(root);
		const activityBarStyle = targetWindow.getComputedStyle(activityBar);
		const sideBarStyle = targetWindow.getComputedStyle(sideBar);
		const panelStyle = targetWindow.getComputedStyle(panel);
		const auxiliaryBarStyle = targetWindow.getComputedStyle(auxiliaryBar);
		const editorStyle = targetWindow.getComputedStyle(editor);
		const editorContentStyle = targetWindow.getComputedStyle(editorContent);
		const webviewOverlayContentStyle = targetWindow.getComputedStyle(webviewOverlayContent);
		const modalWebviewOverlayContentStyle = targetWindow.getComputedStyle(modalWebviewOverlayContent);

		assert.deepStrictEqual({
			activityBar: {
				corners: [activityBarStyle.borderTopLeftRadius, activityBarStyle.borderTopRightRadius, activityBarStyle.borderBottomRightRadius, activityBarStyle.borderBottomLeftRadius],
				cornerBorderCount: activityBarStyle.backgroundImage.split('radial-gradient').length - 1,
			},
			sideBar: {
				margin: [sideBarStyle.marginTop, sideBarStyle.marginRight, sideBarStyle.marginBottom, sideBarStyle.marginLeft],
				corners: [sideBarStyle.borderTopLeftRadius, sideBarStyle.borderTopRightRadius, sideBarStyle.borderBottomRightRadius, sideBarStyle.borderBottomLeftRadius],
				borderColor: sideBarStyle.borderColor,
				allBorderBackgroundsUseBorderBox: sideBarStyle.backgroundOrigin.split(', ').every(origin => origin === 'border-box'),
				cornerBorderCount: sideBarStyle.backgroundImage.split('radial-gradient').length - 1,
			},
			panel: {
				corners: [panelStyle.borderTopLeftRadius, panelStyle.borderTopRightRadius, panelStyle.borderBottomRightRadius, panelStyle.borderBottomLeftRadius],
				borderColor: panelStyle.borderColor,
				allBorderBackgroundsUseBorderBox: panelStyle.backgroundOrigin.split(', ').every(origin => origin === 'border-box'),
				cornerBorderCount: panelStyle.backgroundImage.split('radial-gradient').length - 1,
			},
			auxiliaryBar: {
				corners: [auxiliaryBarStyle.borderTopLeftRadius, auxiliaryBarStyle.borderTopRightRadius, auxiliaryBarStyle.borderBottomRightRadius, auxiliaryBarStyle.borderBottomLeftRadius],
				cornerBorderCount: auxiliaryBarStyle.backgroundImage.split('radial-gradient').length - 1,
			},
			editor: {
				margin: [editorStyle.marginTop, editorStyle.marginRight, editorStyle.marginBottom, editorStyle.marginLeft],
				corners: [editorStyle.borderTopLeftRadius, editorStyle.borderTopRightRadius, editorStyle.borderBottomRightRadius, editorStyle.borderBottomLeftRadius],
				borderColor: editorStyle.borderColor,
				allBorderBackgroundsUseBorderBox: editorStyle.backgroundOrigin.split(', ').every(origin => origin === 'border-box'),
				cornerBorderCount: editorStyle.backgroundImage.split('radial-gradient').length - 1,
			},
			editorContentRadius: editorContentStyle.borderRadius,
			webviewOverlayCorners: [webviewOverlayContentStyle.borderTopLeftRadius, webviewOverlayContentStyle.borderTopRightRadius, webviewOverlayContentStyle.borderBottomRightRadius, webviewOverlayContentStyle.borderBottomLeftRadius],
			modalWebviewOverlayRadius: modalWebviewOverlayContentStyle.borderRadius,
		}, {
			activityBar: {
				corners: ['8px', '0px', '0px', '8px'],
				cornerBorderCount: 2,
			},
			sideBar: {
				margin: ['0px', '0px', '4px', '4px'],
				corners: ['8px', '0px', '0px', '8px'],
				borderColor: 'rgba(0, 0, 0, 0)',
				allBorderBackgroundsUseBorderBox: true,
				cornerBorderCount: 2,
			},
			panel: {
				corners: ['0px', '0px', '0px', '0px'],
				borderColor: 'rgba(0, 0, 0, 0)',
				allBorderBackgroundsUseBorderBox: true,
				cornerBorderCount: 0,
			},
			auxiliaryBar: {
				corners: ['0px', '8px', '8px', '0px'],
				cornerBorderCount: 2,
			},
			editor: {
				margin: ['0px', '0px', '0px', '4px'],
				corners: ['8px', '0px', '0px', '0px'],
				borderColor: 'rgba(0, 0, 0, 0)',
				allBorderBackgroundsUseBorderBox: true,
				cornerBorderCount: 1,
			},
			editorContentRadius: '0px',
			webviewOverlayCorners: ['8px', '0px', '0px', '0px'],
			modalWebviewOverlayRadius: '8px',
		});
	});

	test('uses the registered modern tab colors', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		root.style.setProperty('--vscode-modernTab-activeBackground', '#123456');
		root.style.setProperty('--vscode-modernTab-activeForeground', '#abcdef');
		root.style.setProperty('--vscode-modernTab-hoverBackground', '#654321');
		root.style.setProperty('--vscode-modernTab-hoverForeground', '#fedcba');
		root.style.setProperty('--vscode-modernEditorTab-activeActionBackground', '#102030');
		root.style.setProperty('--vscode-modernEditorTab-activeBackground', '#234567');
		root.style.setProperty('--vscode-modernEditorTab-activeForeground', '#bcdef0');
		root.style.setProperty('--vscode-modernEditorTab-activeHoverActionBackground', '#203040');
		root.style.setProperty('--vscode-modernEditorTab-activeHoverBackground', '#456789');
		root.style.setProperty('--vscode-modernEditorTab-inactiveBackground', '#345678');
		root.style.setProperty('--vscode-modernEditorTab-hoverActionBackground', '#302010');
		root.style.setProperty('--vscode-modernEditorTab-hoverBackground', '#765432');
		root.style.setProperty('--vscode-modernEditorTab-hoverForeground', '#edcba9');
		root.style.setProperty('--vscode-modernEditorTab-selectedActionBackground', '#554433');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const paneAction = createCompositeAction(root, 35, true);
		const editor = appendElement(root, 'part editor');
		const content = appendElement(editor, 'content');
		const editorGroupContainer = appendElement(content, 'editor-group-container');
		const title = appendElement(editorGroupContainer, 'title');
		const tabsContainer = appendElement(title, 'tabs-container');
		const tab = appendElement(tabsContainer, 'tab active');
		const tabFill = appendElement(tab, 'tab-fill');
		const tabLabel = appendElement(tab, 'tab-label');
		const tabLabelAnchor = document.createElement('a');
		tabLabel.appendChild(tabLabelAnchor);
		const inactiveTab = appendElement(tabsContainer, 'tab');
		const inactiveTabFill = appendElement(inactiveTab, 'tab-fill');
		const selectedTab = appendElement(tabsContainer, 'tab selected');
		const selectedTabActions = appendElement(selectedTab, 'tab-actions');
		const selectedTabAction = appendElement(selectedTabActions, 'action-label');
		selectedTabAction.tabIndex = 0;
		const hoverColorProbe = appendElement(root, 'hover-color-probe');
		hoverColorProbe.style.backgroundColor = 'var(--modern-ui-tab-hover-background)';
		hoverColorProbe.style.color = 'var(--vscode-modernTab-hoverForeground)';
		const editorHoverColorProbe = appendElement(root, 'editor-hover-color-probe');
		editorHoverColorProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-hover-background)';
		editorHoverColorProbe.style.color = 'var(--modern-ui-editor-tab-hover-foreground)';
		const editorActiveHoverColorProbe = appendElement(root, 'editor-active-hover-color-probe');
		editorActiveHoverColorProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-active-hover-background)';
		const activeActionColorProbe = appendElement(root, 'active-action-color-probe');
		activeActionColorProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-action-active-background)';
		const activeHoverActionColorProbe = appendElement(root, 'active-hover-action-color-probe');
		activeHoverActionColorProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-action-active-hover-background)';
		const hoverActionColorProbe = appendElement(root, 'hover-action-color-probe');
		hoverActionColorProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-action-hover-background)';
		const settingsEditor = appendElement(root, 'settings-editor');
		const settingsTabsWidget = appendElement(settingsEditor, 'settings-tabs-widget');
		const settingsActionBar = appendElement(settingsTabsWidget, 'monaco-action-bar');
		const settingsActionItem = appendElement(settingsActionBar, 'action-item');
		const settingsActionLabel = appendElement(settingsActionItem, 'action-label checked');
		const activeColor = colorRegistry.getColors().find(color => color.id === MODERN_TAB_ACTIVE_BACKGROUND);
		const activeForeground = colorRegistry.getColors().find(color => color.id === MODERN_TAB_ACTIVE_FOREGROUND);
		const hoverColor = colorRegistry.getColors().find(color => color.id === MODERN_TAB_HOVER_BACKGROUND);
		const hoverForeground = colorRegistry.getColors().find(color => color.id === MODERN_TAB_HOVER_FOREGROUND);
		const editorActiveColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_ACTIVE_BACKGROUND);
		const editorActiveActionColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND);
		const editorActiveForeground = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_ACTIVE_FOREGROUND);
		const editorActiveHoverColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND);
		const editorActiveHoverActionColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND);
		const editorInactiveColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_INACTIVE_BACKGROUND);
		const editorHoverColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_HOVER_BACKGROUND);
		const editorHoverActionColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND);
		const editorHoverForeground = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_HOVER_FOREGROUND);
		const editorSelectedActionColor = colorRegistry.getColors().find(color => color.id === MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND);
		selectedTabAction.focus();

		assert.deepStrictEqual({
			registeredColors: [MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND].map(id => colorRegistry.getColors().some(color => color.id === id)),
			activeDefault: activeColor?.defaults,
			activeForegroundDefault: activeForeground?.defaults,
			hoverDefault: hoverColor?.defaults,
			hoverForegroundDefault: hoverForeground?.defaults,
			editorRegisteredColors: [MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND].map(id => colorRegistry.getColors().some(color => color.id === id)),
			editorDefaults: [editorActiveActionColor?.defaults, editorActiveColor?.defaults, editorActiveForeground?.defaults, editorActiveHoverActionColor?.defaults, editorActiveHoverColor?.defaults, editorInactiveColor?.defaults, editorHoverActionColor?.defaults, editorHoverColor?.defaults, editorHoverForeground?.defaults, editorSelectedActionColor?.defaults],
			paneTabBackground: getWindow(paneAction.indicator).getComputedStyle(paneAction.indicator).backgroundColor,
			paneTabForeground: getWindow(paneAction.actionLabel).getComputedStyle(paneAction.actionLabel).color,
			editorTabBackground: getWindow(tabFill).getComputedStyle(tabFill).backgroundColor,
			editorTabForeground: getWindow(tabLabelAnchor).getComputedStyle(tabLabelAnchor).color,
			editorInactiveTabBackground: getWindow(inactiveTabFill).getComputedStyle(inactiveTabFill).backgroundColor,
			hoverTabBackground: getWindow(hoverColorProbe).getComputedStyle(hoverColorProbe).backgroundColor,
			hoverTabForeground: getWindow(hoverColorProbe).getComputedStyle(hoverColorProbe).color,
			editorHoverTabBackground: getWindow(editorHoverColorProbe).getComputedStyle(editorHoverColorProbe).backgroundColor,
			editorHoverTabForeground: getWindow(editorHoverColorProbe).getComputedStyle(editorHoverColorProbe).color,
			editorActiveHoverTabBackground: getWindow(editorActiveHoverColorProbe).getComputedStyle(editorActiveHoverColorProbe).backgroundColor,
			activeActionBackground: getWindow(activeActionColorProbe).getComputedStyle(activeActionColorProbe).backgroundColor,
			activeHoverActionBackground: getWindow(activeHoverActionColorProbe).getComputedStyle(activeHoverActionColorProbe).backgroundColor,
			hoverActionBackground: getWindow(hoverActionColorProbe).getComputedStyle(hoverActionColorProbe).backgroundColor,
			selectedActionBackground: getWindow(selectedTabActions).getComputedStyle(selectedTabActions).backgroundColor,
			settingsTabBackground: getWindow(settingsActionLabel).getComputedStyle(settingsActionLabel).backgroundColor,
			settingsTabForeground: getWindow(settingsActionLabel).getComputedStyle(settingsActionLabel).color,
		}, {
			registeredColors: [true, true, true, true],
			activeDefault: listInactiveSelectionBackground,
			activeForegroundDefault: oneOf(listInactiveSelectionForeground, foreground),
			hoverDefault: listHoverBackground,
			hoverForegroundDefault: oneOf(listHoverForeground, foreground),
			editorRegisteredColors: [true, true, true, true, true, true, true, true, true, true],
			editorDefaults: [opaque(MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, editorBackground), MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, opaque(MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, editorBackground), MODERN_EDITOR_TAB_HOVER_BACKGROUND, Color.transparent, opaque(MODERN_EDITOR_TAB_HOVER_BACKGROUND, editorBackground), MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, opaque(TAB_SELECTED_BACKGROUND, editorBackground)],
			paneTabBackground: 'rgb(18, 52, 86)',
			paneTabForeground: 'rgb(171, 205, 239)',
			editorTabBackground: 'rgb(35, 69, 103)',
			editorTabForeground: 'rgb(188, 222, 240)',
			editorInactiveTabBackground: 'rgb(52, 86, 120)',
			hoverTabBackground: 'rgb(101, 67, 33)',
			hoverTabForeground: 'rgb(254, 220, 186)',
			editorHoverTabBackground: 'rgb(118, 84, 50)',
			editorHoverTabForeground: 'rgb(237, 203, 169)',
			editorActiveHoverTabBackground: 'rgb(69, 103, 137)',
			activeActionBackground: 'rgb(16, 32, 48)',
			activeHoverActionBackground: 'rgb(32, 48, 64)',
			hoverActionBackground: 'rgb(48, 32, 16)',
			selectedActionBackground: 'rgb(85, 68, 51)',
			settingsTabBackground: 'rgb(18, 52, 86)',
			settingsTabForeground: 'rgb(171, 205, 239)',
		});
	});

	test('applies editor tab foregrounds to the icon, name, and description', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		root.style.setProperty('--modern-ui-editor-tab-active-foreground', '#010203');
		root.style.setProperty('--modern-ui-editor-tab-inactive-foreground', '#040506');
		root.style.setProperty('--modern-ui-editor-tab-unfocused-active-foreground', '#070809');
		root.style.setProperty('--modern-ui-editor-tab-unfocused-inactive-foreground', '#0a0b0c');
		root.style.setProperty('--vscode-tab-selectedForeground', '#0d0e0f');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const content = appendElement(appendElement(root, 'part editor'), 'content');
		const createGroup = (active: boolean): HTMLElement => {
			const group = appendElement(content, `editor-group-container${active ? ' active' : ''}`);
			return appendElement(appendElement(group, 'title'), 'tabs-container');
		};
		const createTab = (tabs: HTMLElement, classes: string, labelClasses?: string) => createEditorTabLabel(appendElement(tabs, `tab${classes ? ` ${classes}` : ''}`), labelClasses);

		const activeTabs = createGroup(true);
		const activeLabel = createTab(activeTabs, 'active');
		const inactiveLabel = createTab(activeTabs, '');
		const selectedLabel = createTab(activeTabs, 'selected');
		const decoratedLabel = createTab(activeTabs, '', 'monaco-decoration-itemColor');
		decoratedLabel.label.style.color = '#101112';

		const unfocusedTabs = createGroup(false);
		const unfocusedActiveLabel = createTab(unfocusedTabs, 'active');
		const unfocusedInactiveLabel = createTab(unfocusedTabs, '');

		const getLabelColors = (label: { label: HTMLElement; name: HTMLElement; description: HTMLElement }) => {
			const targetWindow = getWindow(label.label);
			return [
				targetWindow.getComputedStyle(label.label, '::before').color,
				targetWindow.getComputedStyle(label.name).color,
				targetWindow.getComputedStyle(label.description).color,
			];
		};

		assert.deepStrictEqual({
			active: getLabelColors(activeLabel),
			inactive: getLabelColors(inactiveLabel),
			selected: getLabelColors(selectedLabel),
			decorated: getLabelColors(decoratedLabel),
			unfocusedActive: getLabelColors(unfocusedActiveLabel),
			unfocusedInactive: getLabelColors(unfocusedInactiveLabel),
		}, {
			active: ['rgb(1, 2, 3)', 'rgb(1, 2, 3)', 'rgb(1, 2, 3)'],
			inactive: ['rgb(4, 5, 6)', 'rgb(4, 5, 6)', 'rgb(4, 5, 6)'],
			selected: ['rgb(13, 14, 15)', 'rgb(13, 14, 15)', 'rgb(13, 14, 15)'],
			decorated: ['rgb(16, 17, 18)', 'rgb(16, 17, 18)', 'rgb(16, 17, 18)'],
			unfocusedActive: ['rgb(7, 8, 9)', 'rgb(7, 8, 9)', 'rgb(7, 8, 9)'],
			unfocusedInactive: ['rgb(10, 11, 12)', 'rgb(10, 11, 12)', 'rgb(10, 11, 12)'],
		});
	});

	test('keeps clean editor tabs compact while reserving persistent indicators', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		root.style.setProperty('--vscode-spacing-size60', '6px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-spacing-size280', '28px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const editor = appendElement(root, 'part editor');
		const compactTitle = appendElement(editor, 'title tabs');
		const compactTabs = appendElement(compactTitle, 'tabs-container');
		const compactTab = appendElement(compactTabs, 'tab');
		const dirtyTab = appendElement(compactTabs, 'tab dirty');
		const dirtyCloseOffTab = appendElement(compactTabs, 'tab dirty close-action-off');
		const dirtyBorderTopTab = appendElement(compactTabs, 'tab dirty dirty-border-top close-action-off');
		const dirtyBorderTopCloseableTab = appendElement(compactTabs, 'tab dirty dirty-border-top');
		const stickyTab = appendElement(compactTabs, 'tab sticky');
		const stickyActionOffTab = appendElement(compactTabs, 'tab sticky pinned-action-off close-action-off');
		const dirtyLeftTab = appendElement(compactTabs, 'tab dirty tab-actions-left');
		const dirtyBorderTopLeftTab = appendElement(compactTabs, 'tab dirty dirty-border-top close-action-off tab-actions-left');
		const dirtyBorderTopCloseableLeftTab = appendElement(compactTabs, 'tab dirty dirty-border-top tab-actions-left');
		const reservedTitle = appendElement(editor, 'title tabs tab-actions-reserve-space');
		const reservedTabs = appendElement(reservedTitle, 'tabs-container');
		const reservedTab = appendElement(reservedTabs, 'tab');
		const reservedLeftTab = appendElement(reservedTabs, 'tab tab-actions-left');
		const reservedDirtyBorderTopTab = appendElement(reservedTabs, 'tab dirty dirty-border-top');
		const reservedDirtyBorderTopLeftTab = appendElement(reservedTabs, 'tab dirty dirty-border-top tab-actions-left');

		const targetWindow = getWindow(root);
		assert.deepStrictEqual({
			compact: [targetWindow.getComputedStyle(compactTab).paddingLeft, targetWindow.getComputedStyle(compactTab).paddingRight],
			dirty: [targetWindow.getComputedStyle(dirtyTab).paddingLeft, targetWindow.getComputedStyle(dirtyTab).paddingRight],
			dirtyCloseOff: [targetWindow.getComputedStyle(dirtyCloseOffTab).paddingLeft, targetWindow.getComputedStyle(dirtyCloseOffTab).paddingRight],
			dirtyBorderTop: [targetWindow.getComputedStyle(dirtyBorderTopTab).paddingLeft, targetWindow.getComputedStyle(dirtyBorderTopTab).paddingRight],
			dirtyBorderTopCloseable: [targetWindow.getComputedStyle(dirtyBorderTopCloseableTab).paddingLeft, targetWindow.getComputedStyle(dirtyBorderTopCloseableTab).paddingRight],
			sticky: [targetWindow.getComputedStyle(stickyTab).paddingLeft, targetWindow.getComputedStyle(stickyTab).paddingRight],
			stickyActionOff: [targetWindow.getComputedStyle(stickyActionOffTab).paddingLeft, targetWindow.getComputedStyle(stickyActionOffTab).paddingRight],
			dirtyLeft: [targetWindow.getComputedStyle(dirtyLeftTab).paddingLeft, targetWindow.getComputedStyle(dirtyLeftTab).paddingRight],
			dirtyBorderTopLeft: [targetWindow.getComputedStyle(dirtyBorderTopLeftTab).paddingLeft, targetWindow.getComputedStyle(dirtyBorderTopLeftTab).paddingRight],
			dirtyBorderTopCloseableLeft: [targetWindow.getComputedStyle(dirtyBorderTopCloseableLeftTab).paddingLeft, targetWindow.getComputedStyle(dirtyBorderTopCloseableLeftTab).paddingRight],
			reserved: [targetWindow.getComputedStyle(reservedTab).paddingLeft, targetWindow.getComputedStyle(reservedTab).paddingRight],
			reservedLeft: [targetWindow.getComputedStyle(reservedLeftTab).paddingLeft, targetWindow.getComputedStyle(reservedLeftTab).paddingRight],
			reservedDirtyBorderTop: [targetWindow.getComputedStyle(reservedDirtyBorderTopTab).paddingLeft, targetWindow.getComputedStyle(reservedDirtyBorderTopTab).paddingRight],
			reservedDirtyBorderTopLeft: [targetWindow.getComputedStyle(reservedDirtyBorderTopLeftTab).paddingLeft, targetWindow.getComputedStyle(reservedDirtyBorderTopLeftTab).paddingRight],
		}, {
			compact: ['6px', '8px'],
			dirty: ['6px', '28px'],
			dirtyCloseOff: ['6px', '28px'],
			dirtyBorderTop: ['6px', '8px'],
			dirtyBorderTopCloseable: ['6px', '8px'],
			sticky: ['6px', '28px'],
			stickyActionOff: ['6px', '8px'],
			dirtyLeft: ['28px', '8px'],
			dirtyBorderTopLeft: ['6px', '8px'],
			dirtyBorderTopCloseableLeft: ['6px', '8px'],
			reserved: ['6px', '28px'],
			reservedLeft: ['28px', '8px'],
			reservedDirtyBorderTop: ['6px', '28px'],
			reservedDirtyBorderTopLeft: ['28px', '8px'],
		});
	});

	test('persists tab actions when action space is reserved', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const content = appendElement(appendElement(root, 'part editor'), 'content');
		const createTab = (groupClassName: string, titleClassName: string): HTMLElement => {
			const title = appendElement(appendElement(content, groupClassName), titleClassName);
			const tab = appendElement(appendElement(title, 'tabs-container'), 'tab');
			return appendElement(appendElement(tab, 'tab-actions'), 'action-label');
		};

		const reservedActive = createTab('editor-group-container active', 'title tab-actions-reserve-space');
		const reservedInactiveGroup = createTab('editor-group-container', 'title tab-actions-reserve-space');
		const transientActive = createTab('editor-group-container active', 'title');

		const targetWindow = getWindow(root);
		assert.deepStrictEqual({
			reservedActive: { opacity: targetWindow.getComputedStyle(reservedActive).opacity, pointerEvents: targetWindow.getComputedStyle(reservedActive.parentElement!).pointerEvents },
			reservedInactiveGroup: { opacity: targetWindow.getComputedStyle(reservedInactiveGroup).opacity, pointerEvents: targetWindow.getComputedStyle(reservedInactiveGroup.parentElement!).pointerEvents },
			transientActive: { opacity: targetWindow.getComputedStyle(transientActive).opacity, pointerEvents: targetWindow.getComputedStyle(transientActive.parentElement!).pointerEvents },
		}, {
			reservedActive: { opacity: '1', pointerEvents: 'auto' },
			reservedInactiveGroup: { opacity: '0.5', pointerEvents: 'auto' },
			transientActive: { opacity: '0', pointerEvents: 'none' },
		});
	});

	test('fades tab actions only when they overlay clean tabs', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const group = appendElement(appendElement(appendElement(root, 'part editor'), 'content'), 'editor-group-container active');
		const getFadeContent = (titleClassName: string, tabClassName: string): string => {
			const title = appendElement(group, titleClassName);
			const tab = appendElement(appendElement(title, 'tabs-container'), tabClassName);
			const actions = appendElement(tab, 'tab-actions');
			const action = appendElement(actions, 'action-label');
			action.tabIndex = 0;
			action.focus();
			return getWindow(actions).getComputedStyle(actions, '::before').content;
		};

		assert.deepStrictEqual({
			overlaid: getFadeContent('title', 'tab'),
			reserved: getFadeContent('title tab-actions-reserve-space', 'tab'),
			dirty: getFadeContent('title', 'tab dirty'),
			sticky: getFadeContent('title', 'tab sticky'),
		}, {
			overlaid: '""',
			reserved: 'none',
			dirty: 'none',
			sticky: 'none',
		});
	});

	test('applies the correct action background for each editor tab state', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui-tabs';
		root.style.setProperty('--modern-ui-editor-tab-action-active-background', '#010203');
		root.style.setProperty('--modern-ui-editor-tab-action-unfocused-active-background', '#040506');
		root.style.setProperty('--modern-ui-editor-tab-action-hover-background', '#070809');
		root.style.setProperty('--modern-ui-editor-tab-action-unfocused-hover-background', '#0A0B0C');
		root.style.setProperty('--modern-ui-editor-tab-action-active-hover-background', '#0D0E0F');
		root.style.setProperty('--modern-ui-editor-tab-action-unfocused-active-hover-background', '#101112');
		root.style.setProperty('--vscode-modernEditorTab-selectedActionBackground', '#131415');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const content = appendElement(appendElement(root, 'part editor'), 'content');
		const activeGroup = appendElement(content, 'editor-group-container active');
		const unfocusedGroup = appendElement(content, 'editor-group-container');
		const getActionBackgroundColors = (group: HTMLElement, tabClassName: string) => {
			const title = appendElement(group, 'title');
			const tab = appendElement(appendElement(title, 'tabs-container'), tabClassName);
			const actions = appendElement(tab, 'tab-actions');
			const action = appendElement(actions, 'action-label');
			action.tabIndex = 0;
			action.focus();
			return [
				getWindow(actions).getComputedStyle(actions).backgroundColor,
				getWindow(actions).getComputedStyle(actions, '::before').backgroundImage
			];
		};

		assert.deepStrictEqual({
			active: getActionBackgroundColors(activeGroup, 'tab active'),
			activeLeft: getActionBackgroundColors(activeGroup, 'tab active tab-actions-left'),
			unfocusedActive: getActionBackgroundColors(unfocusedGroup, 'tab active'),
			unfocusedActiveLeft: getActionBackgroundColors(unfocusedGroup, 'tab active tab-actions-left'),
			hover: getActionBackgroundColors(activeGroup, 'tab'),
			hoverLeft: getActionBackgroundColors(activeGroup, 'tab tab-actions-left'),
			unfocusedHover: getActionBackgroundColors(unfocusedGroup, 'tab'),
			unfocusedHoverLeft: getActionBackgroundColors(unfocusedGroup, 'tab tab-actions-left'),
			// Active hover states cannot be tested because they require the :hover state.
			// activeHover: getActionBackgroundColors(activeGroup, 'tab active'),
			// activeHoverLeft: getActionBackgroundColors(activeGroup, 'tab active tab-actions-left'),
			// unfocusedActiveHover: getActionBackgroundColors(unfocusedGroup, 'tab active'),
			// unfocusedActiveHoverLeft: getActionBackgroundColors(unfocusedGroup, 'tab active tab-actions-left'),
			selected: getActionBackgroundColors(activeGroup, 'tab selected'),
			selectedLeft: getActionBackgroundColors(activeGroup, 'tab selected tab-actions-left'),
		}, {
			active: ['rgb(1, 2, 3)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(1, 2, 3))'],
			activeLeft: ['rgb(1, 2, 3)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(1, 2, 3))'],
			unfocusedActive: ['rgb(4, 5, 6)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(4, 5, 6))'],
			unfocusedActiveLeft: ['rgb(4, 5, 6)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(4, 5, 6))'],
			hover: ['rgb(7, 8, 9)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(7, 8, 9))'],
			hoverLeft: ['rgb(7, 8, 9)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(7, 8, 9))'],
			unfocusedHover: ['rgb(10, 11, 12)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(10, 11, 12))'],
			unfocusedHoverLeft: ['rgb(10, 11, 12)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(10, 11, 12))'],
			// activeHover: ['rgb(13, 14, 15)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(13, 14, 15))'],
			// activeHoverLeft: ['rgb(13, 14, 15)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(13, 14, 15))'],
			// unfocusedActiveHover: ['rgb(16, 17, 18)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(16, 17, 18))'],
			// unfocusedActiveHoverLeft: ['rgb(16, 17, 18)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(16, 17, 18))'],
			selected: ['rgb(19, 20, 21)', 'linear-gradient(to right, rgba(0, 0, 0, 0), rgb(19, 20, 21))'],
			selectedLeft: ['rgb(19, 20, 21)', 'linear-gradient(to left, rgba(0, 0, 0, 0), rgb(19, 20, 21))'],
		});
	});

	test('uses legacy color customizations for Modern UI editor tabs only', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', {
			[editorBackground]: '#000000',
			[MODERN_TAB_ACTIVE_BACKGROUND]: '#010203',
			[MODERN_TAB_ACTIVE_FOREGROUND]: '#A0B0C0',
			[MODERN_TAB_HOVER_BACKGROUND]: '#020304',
			[MODERN_TAB_HOVER_FOREGROUND]: '#B0C0D0',
			[TAB_UNFOCUSED_HOVER_BACKGROUND]: '#0A0B0C',
		});
		theme.setCustomColors({
			[TAB_ACTIVE_BACKGROUND]: '#123456',
			[TAB_ACTIVE_BORDER]: '#556677',
			[TAB_ACTIVE_BORDER_TOP]: '#334455',
			[TAB_ACTIVE_FOREGROUND]: '#FEDCBA',
			[TAB_BORDER]: '#778899',
			[TAB_HOVER_BACKGROUND]: '#456789',
			[TAB_HOVER_BORDER]: '#112233',
			[TAB_HOVER_FOREGROUND]: '#DDEEFF',
			[TAB_INACTIVE_BACKGROUND]: '#345678',
			[TAB_INACTIVE_FOREGROUND]: '#CCDDEE',
			[TAB_LAST_PINNED_BORDER]: '#8899AA',
		});

		const style = document.createElement('style');
		style.textContent = generateColorThemeCSS(theme, '.legacy-tab-customization-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;
		document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));

		const root = document.createElement('div');
		root.className = 'legacy-tab-customization-theme monaco-workbench modern-ui-tabs';
		root.style.setProperty('--vscode-strokeThickness', '1px');
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const paneAction = createCompositeAction(root, 35, true);
		const editor = appendElement(root, 'part editor');
		const content = appendElement(editor, 'content');
		const activeGroup = appendElement(content, 'editor-group-container active');
		const activeTitle = appendElement(activeGroup, 'title');
		const activeTabs = appendElement(activeTitle, 'tabs-container');
		const activeTab = appendElement(activeTabs, 'tab active tab-border-bottom tab-border-top');
		const activeFill = appendElement(activeTab, 'tab-fill');
		const activeLabel = appendElement(activeTab, 'tab-label');
		const activeLabelAnchor = document.createElement('a');
		activeLabel.appendChild(activeLabelAnchor);
		const activeTabActions = appendElement(activeTab, 'tab-actions');
		const activeTabAction = appendElement(activeTabActions, 'action-label');
		activeTabAction.tabIndex = 0;
		const inactiveTab = appendElement(activeTabs, 'tab');
		const inactiveFill = appendElement(inactiveTab, 'tab-fill');
		const inactiveLabel = appendElement(inactiveTab, 'tab-label');
		const inactiveLabelAnchor = document.createElement('a');
		inactiveLabel.appendChild(inactiveLabelAnchor);
		const unfocusedGroup = appendElement(content, 'editor-group-container');
		const unfocusedTitle = appendElement(unfocusedGroup, 'title');
		const unfocusedTabs = appendElement(unfocusedTitle, 'tabs-container');
		const unfocusedTab = appendElement(unfocusedTabs, 'tab active');
		const unfocusedFill = appendElement(unfocusedTab, 'tab-fill');
		const unfocusedLabel = appendElement(unfocusedTab, 'tab-label');
		const unfocusedLabelAnchor = document.createElement('a');
		unfocusedLabel.appendChild(unfocusedLabelAnchor);
		const unfocusedInactiveTab = appendElement(unfocusedTabs, 'tab');
		const unfocusedInactiveFill = appendElement(unfocusedInactiveTab, 'tab-fill');
		const unfocusedInactiveLabel = appendElement(unfocusedInactiveTab, 'tab-label');
		const unfocusedInactiveLabelAnchor = document.createElement('a');
		unfocusedInactiveLabel.appendChild(unfocusedInactiveLabelAnchor);
		const hoverProbe = appendElement(root, 'hover-probe');
		hoverProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-hover-background)';
		hoverProbe.style.color = 'var(--modern-ui-editor-tab-hover-foreground)';
		const unfocusedHoverProbe = appendElement(root, 'unfocused-hover-probe');
		unfocusedHoverProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-unfocused-hover-background)';
		unfocusedHoverProbe.style.color = 'var(--modern-ui-editor-tab-unfocused-hover-foreground)';
		const activeHoverProbe = appendElement(root, 'active-hover-probe');
		activeHoverProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-active-hover-background)';
		const unfocusedActiveHoverProbe = appendElement(root, 'unfocused-active-hover-probe');
		unfocusedActiveHoverProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-unfocused-active-hover-background)';
		const activeHoverActionProbe = appendElement(root, 'active-hover-action-probe');
		activeHoverActionProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-action-active-hover-background)';
		const unfocusedBorderProbe = appendElement(root, 'unfocused-border-probe');
		unfocusedBorderProbe.style.color = 'var(--modern-ui-editor-tab-unfocused-active-border)';
		unfocusedBorderProbe.style.borderTopColor = 'var(--modern-ui-editor-tab-unfocused-active-border-top)';
		unfocusedBorderProbe.style.borderBottomColor = 'var(--modern-ui-editor-tab-unfocused-hover-border)';
		const separatorProbe = appendElement(root, 'separator-probe');
		separatorProbe.style.color = 'var(--modern-ui-editor-tab-border)';
		separatorProbe.style.borderColor = 'var(--modern-ui-editor-tab-last-pinned-border)';
		const twoRowTitle = appendElement(activeGroup, 'title two-tab-bars');
		const pinnedRow = appendElement(twoRowTitle, 'tabs-and-actions-container');
		appendElement(twoRowTitle, 'tabs-and-actions-container');
		activeTabAction.focus();
		const activeTabActionStyle = getWindow(activeTabActions).getComputedStyle(activeTabActions);
		const activeTabActionFadeStyle = getWindow(activeTabActions).getComputedStyle(activeTabActions, '::before');
		const pinnedRowStyle = getWindow(pinnedRow).getComputedStyle(pinnedRow);

		assert.deepStrictEqual({
			paneBackground: getWindow(paneAction.indicator).getComputedStyle(paneAction.indicator).backgroundColor,
			paneForeground: getWindow(paneAction.actionLabel).getComputedStyle(paneAction.actionLabel).color,
			activeBackground: getWindow(activeFill).getComputedStyle(activeFill).backgroundColor,
			activeForeground: getWindow(activeLabelAnchor).getComputedStyle(activeLabelAnchor).color,
			activeBorderTop: getWindow(activeFill).getComputedStyle(activeFill).borderTopColor,
			activeBorderBottom: getWindow(activeFill).getComputedStyle(activeFill).borderBottomColor,
			inactiveBackground: getWindow(inactiveFill).getComputedStyle(inactiveFill).backgroundColor,
			inactiveForeground: getWindow(inactiveLabelAnchor).getComputedStyle(inactiveLabelAnchor).color,
			unfocusedActiveBackground: getWindow(unfocusedFill).getComputedStyle(unfocusedFill).backgroundColor,
			unfocusedActiveForeground: getWindow(unfocusedLabelAnchor).getComputedStyle(unfocusedLabelAnchor).color,
			unfocusedInactiveBackground: getWindow(unfocusedInactiveFill).getComputedStyle(unfocusedInactiveFill).backgroundColor,
			unfocusedInactiveForeground: getWindow(unfocusedInactiveLabelAnchor).getComputedStyle(unfocusedInactiveLabelAnchor).color,
			hoverBackground: getWindow(hoverProbe).getComputedStyle(hoverProbe).backgroundColor,
			hoverForeground: getWindow(hoverProbe).getComputedStyle(hoverProbe).color,
			unfocusedHoverBackground: getWindow(unfocusedHoverProbe).getComputedStyle(unfocusedHoverProbe).backgroundColor,
			unfocusedHoverForeground: getWindow(unfocusedHoverProbe).getComputedStyle(unfocusedHoverProbe).color,
			activeHoverBackground: getWindow(activeHoverProbe).getComputedStyle(activeHoverProbe).backgroundColor,
			unfocusedActiveHoverBackground: getWindow(unfocusedActiveHoverProbe).getComputedStyle(unfocusedActiveHoverProbe).backgroundColor,
			activeHoverActionBackground: getWindow(activeHoverActionProbe).getComputedStyle(activeHoverActionProbe).backgroundColor,
			unfocusedActiveBorder: getWindow(unfocusedBorderProbe).getComputedStyle(unfocusedBorderProbe).color,
			unfocusedActiveBorderTop: getWindow(unfocusedBorderProbe).getComputedStyle(unfocusedBorderProbe).borderTopColor,
			unfocusedHoverBorder: getWindow(unfocusedBorderProbe).getComputedStyle(unfocusedBorderProbe).borderBottomColor,
			actionBackground: activeTabActionStyle.backgroundColor,
			actionBackgroundClip: activeTabActionStyle.backgroundClip,
			actionBorderBlockWidth: [activeTabActionStyle.borderTopWidth, activeTabActionStyle.borderBottomWidth],
			actionInlineEndBorderColor: activeTabActionStyle.borderRightColor,
			actionFadeBackgroundClip: activeTabActionFadeStyle.backgroundClip,
			actionFadeBorderBlockWidth: [activeTabActionFadeStyle.borderTopWidth, activeTabActionFadeStyle.borderBottomWidth],
			separatorColor: getWindow(separatorProbe).getComputedStyle(separatorProbe).color,
			lastPinnedBorder: getWindow(separatorProbe).getComputedStyle(separatorProbe).borderTopColor,
			pinnedRowUsesLastPinnedBorder: pinnedRowStyle.boxShadow.includes('rgb(136, 153, 170)'),
		}, {
			paneBackground: 'rgb(1, 2, 3)',
			paneForeground: 'rgb(160, 176, 192)',
			activeBackground: 'rgb(18, 52, 86)',
			activeForeground: 'rgb(254, 220, 186)',
			activeBorderTop: 'rgb(51, 68, 85)',
			activeBorderBottom: 'rgb(85, 102, 119)',
			inactiveBackground: 'rgb(52, 86, 120)',
			inactiveForeground: 'rgb(204, 221, 238)',
			unfocusedActiveBackground: 'rgb(18, 52, 86)',
			unfocusedActiveForeground: 'rgba(254, 220, 186, 0.5)',
			unfocusedInactiveBackground: 'rgb(52, 86, 120)',
			unfocusedInactiveForeground: 'rgba(204, 221, 238, 0.5)',
			hoverBackground: 'rgb(69, 103, 137)',
			hoverForeground: 'rgb(221, 238, 255)',
			unfocusedHoverBackground: 'rgb(10, 11, 12)',
			unfocusedHoverForeground: 'rgba(221, 238, 255, 0.5)',
			activeHoverBackground: 'rgb(69, 103, 137)',
			unfocusedActiveHoverBackground: 'rgb(10, 11, 12)',
			activeHoverActionBackground: 'rgb(69, 103, 137)',
			unfocusedActiveBorder: 'rgba(85, 102, 119, 0.5)',
			unfocusedActiveBorderTop: 'rgba(51, 68, 85, 0.5)',
			unfocusedHoverBorder: 'rgba(17, 34, 51, 0.5)',
			actionBackground: 'rgb(18, 52, 86)',
			actionBackgroundClip: 'padding-box',
			actionBorderBlockWidth: ['1px', '1px'],
			actionInlineEndBorderColor: 'rgba(0, 0, 0, 0)',
			actionFadeBackgroundClip: 'padding-box',
			actionFadeBorderBlockWidth: ['1px', '1px'],
			separatorColor: 'rgb(119, 136, 153)',
			lastPinnedBorder: 'rgb(136, 153, 170)',
			pinnedRowUsesLastPinnedBorder: true,
		});
	});

	test('prefers explicit modern tab customizations over legacy colors', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#000000' });
		theme.setCustomColors({
			[MODERN_TAB_ACTIVE_BACKGROUND]: '#ABCDEF',
			[MODERN_TAB_ACTIVE_FOREGROUND]: '#102030',
			[TAB_ACTIVE_BACKGROUND]: '#123456',
			[TAB_ACTIVE_FOREGROUND]: '#FEDCBA',
		});

		const style = document.createElement('style');
		style.textContent = generateColorThemeCSS(theme, '.modern-tab-customization-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;
		document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));

		const root = document.createElement('div');
		root.className = 'modern-tab-customization-theme monaco-workbench modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const paneAction = createCompositeAction(root, 35, true);
		const editor = appendElement(root, 'part editor');
		const content = appendElement(editor, 'content');
		const editorGroup = appendElement(content, 'editor-group-container active');
		const title = appendElement(editorGroup, 'title');
		const tabs = appendElement(title, 'tabs-container');
		const tab = appendElement(tabs, 'tab active');
		const fill = appendElement(tab, 'tab-fill');
		const label = appendElement(tab, 'tab-label');
		const labelAnchor = document.createElement('a');
		label.appendChild(labelAnchor);

		assert.deepStrictEqual({
			paneBackground: getWindow(paneAction.indicator).getComputedStyle(paneAction.indicator).backgroundColor,
			paneForeground: getWindow(paneAction.actionLabel).getComputedStyle(paneAction.actionLabel).color,
			editorBackground: getWindow(fill).getComputedStyle(fill).backgroundColor,
			editorForeground: getWindow(labelAnchor).getComputedStyle(labelAnchor).color,
		}, {
			paneBackground: 'rgb(171, 205, 239)',
			paneForeground: 'rgb(16, 32, 48)',
			editorBackground: 'rgb(171, 205, 239)',
			editorForeground: 'rgb(16, 32, 48)',
		});
	});

	test('prefers editor-specific modern tab customizations over legacy colors', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', {
			[editorBackground]: '#000000',
			[MODERN_TAB_ACTIVE_BACKGROUND]: '#ABCDEF',
			[MODERN_TAB_ACTIVE_FOREGROUND]: '#102030',
		});
		theme.setCustomColors({
			[MODERN_EDITOR_TAB_ACTIVE_BACKGROUND]: '#2468AC',
			[MODERN_EDITOR_TAB_ACTIVE_FOREGROUND]: '#13579B',
			[MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND]: '#48ACF0',
			[MODERN_EDITOR_TAB_INACTIVE_BACKGROUND]: '#369CF0',
			[TAB_ACTIVE_BACKGROUND]: '#123456',
			[TAB_ACTIVE_FOREGROUND]: '#FEDCBA',
			[TAB_HOVER_BACKGROUND]: '#456789',
			[TAB_INACTIVE_BACKGROUND]: '#345678',
		});

		const style = document.createElement('style');
		style.textContent = generateColorThemeCSS(theme, '.modern-editor-tab-customization-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;
		document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));

		const root = document.createElement('div');
		root.className = 'modern-editor-tab-customization-theme monaco-workbench modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const paneAction = createCompositeAction(root, 35, true);
		const editor = appendElement(root, 'part editor');
		const content = appendElement(editor, 'content');
		const editorGroup = appendElement(content, 'editor-group-container active');
		const title = appendElement(editorGroup, 'title');
		const tabs = appendElement(title, 'tabs-container');
		const tab = appendElement(tabs, 'tab active');
		const fill = appendElement(tab, 'tab-fill');
		const label = appendElement(tab, 'tab-label');
		const labelAnchor = document.createElement('a');
		label.appendChild(labelAnchor);
		const inactiveTab = appendElement(tabs, 'tab');
		const inactiveFill = appendElement(inactiveTab, 'tab-fill');
		const activeHoverProbe = appendElement(root, 'active-hover-probe');
		activeHoverProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-active-hover-background)';
		const activeHoverActionProbe = appendElement(root, 'active-hover-action-probe');
		activeHoverActionProbe.style.backgroundColor = 'var(--modern-ui-editor-tab-action-active-hover-background)';

		assert.deepStrictEqual({
			paneBackground: getWindow(paneAction.indicator).getComputedStyle(paneAction.indicator).backgroundColor,
			paneForeground: getWindow(paneAction.actionLabel).getComputedStyle(paneAction.actionLabel).color,
			editorBackground: getWindow(fill).getComputedStyle(fill).backgroundColor,
			editorForeground: getWindow(labelAnchor).getComputedStyle(labelAnchor).color,
			editorInactiveBackground: getWindow(inactiveFill).getComputedStyle(inactiveFill).backgroundColor,
			editorActiveHoverBackground: getWindow(activeHoverProbe).getComputedStyle(activeHoverProbe).backgroundColor,
			editorActiveHoverActionBackground: getWindow(activeHoverActionProbe).getComputedStyle(activeHoverActionProbe).backgroundColor,
		}, {
			paneBackground: 'rgb(171, 205, 239)',
			paneForeground: 'rgb(16, 32, 48)',
			editorBackground: 'rgb(36, 104, 172)',
			editorForeground: 'rgb(19, 87, 155)',
			editorInactiveBackground: 'rgb(54, 156, 240)',
			editorActiveHoverBackground: 'rgb(72, 172, 240)',
			editorActiveHoverActionBackground: 'rgb(72, 172, 240)',
		});
	});

	test('derives inactive tab foreground from a legacy active foreground customization', () => {
		const theme = ColorThemeData.createUnloadedTheme('vs-dark', { [editorBackground]: '#000000' });
		theme.setCustomColors({ [TAB_ACTIVE_FOREGROUND]: '#FEDCBA' });

		const style = document.createElement('style');
		style.textContent = generateColorThemeCSS(theme, '.active-foreground-only-theme', themingRegistry.getThemingParticipants(), TestEnvironmentService).code;
		document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));

		const root = document.createElement('div');
		root.className = 'active-foreground-only-theme monaco-workbench modern-ui-tabs';
		document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));

		const editor = appendElement(root, 'part editor');
		const content = appendElement(editor, 'content');
		const activeGroup = appendElement(content, 'editor-group-container active');
		const activeTabs = appendElement(appendElement(activeGroup, 'title'), 'tabs-container');
		const inactiveAnchor = document.createElement('a');
		appendElement(appendElement(activeTabs, 'tab'), 'tab-label').appendChild(inactiveAnchor);
		const unfocusedGroup = appendElement(content, 'editor-group-container');
		const unfocusedTabs = appendElement(appendElement(unfocusedGroup, 'title'), 'tabs-container');
		const unfocusedInactiveAnchor = document.createElement('a');
		appendElement(appendElement(unfocusedTabs, 'tab'), 'tab-label').appendChild(unfocusedInactiveAnchor);

		assert.deepStrictEqual({
			inactiveForeground: getWindow(inactiveAnchor).getComputedStyle(inactiveAnchor).color,
			unfocusedInactiveForeground: getWindow(unfocusedInactiveAnchor).getComputedStyle(unfocusedInactiveAnchor).color,
		}, {
			inactiveForeground: 'rgba(254, 220, 186, 0.5)',
			unfocusedInactiveForeground: 'rgba(254, 220, 186, 0.25)',
		});
	});

	test('keeps panel global actions above overflowing title actions', () => {
		const root = document.createElement('div');
		root.className = 'monaco-workbench modern-ui';
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
			globalActionsBackground: 'rgba(0, 0, 0, 0)',
		});
	});
});
