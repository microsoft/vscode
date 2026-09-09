/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIDensity } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DEFAULT_SCROLLBAR_SIZE, setGlobalDefaultScrollbarSize } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { COMPACT_NOTIFICATION_ROW_HEIGHT, DEFAULT_NOTIFICATION_ROW_HEIGHT, setNotificationRowHeight } from '../../../browser/parts/notifications/notificationsViewer.js';
import { DEFAULT_PANE_HEADER_SIZE, setGlobalPaneHeaderSize } from '../../../../base/browser/ui/splitview/paneview.js';

/** Reduced scrollbar size (px) applied when Modern UI is on. */
const MODERN_UI_SCROLLBAR_SIZE = 8;

/** Increased pane header size (px) applied when Modern UI is on. */
const MODERN_UI_PANE_HEADER_SIZE = 28;

// Bundle the CSS for every Modern UI module. Styles remain inert until their
// corresponding classes are toggled onto the workbench container(s) below.
import './media/activityBar.css';
import './media/commandCenter.css';
import './media/editorBorder.css';
import './media/fontRamp.css';
import './media/keyboardFocusOnly.css';
import './media/notificationsDialogs.css';
import './media/padding.css';
import './media/paneHeaders.css';
import './media/roundedCorners.css';
import './media/sashHandles.css';
import './media/shadows.css';
import './media/statusBar.css';
import './media/tabs.css';
import './media/titlebar.css';
import '../../../services/themes/browser/modernTabColorCustomizations.js';

interface IModernUIModule {
	readonly id: string;
	/**
	 * Whether this module changes layout metrics. Toggling such a module requires
	 * a workbench relayout; modules without this flag only affect appearance.
	 */
	readonly layoutAffecting?: boolean;
}

/**
 * The primary class toggled when the Modern UI experiment is enabled. Modules
 * that can be reused independently also receive dedicated classes below.
 */
const MODERN_UI_CLASS = 'modern-ui';
const MODERN_UI_COMPACT_CLASS = 'modern-ui-compact';
const MODERN_UI_TABS_CLASS = 'modern-ui-tabs';
const MODERN_UI_NOTIFICATIONS_DIALOGS_CLASS = 'modern-ui-notifications-dialogs';
const MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS = 'modern-ui-uppercase-view-headers';

const LayoutDensityMenu = new MenuId('LayoutDensityMenu');
const layoutDensityOptions = [
	{ density: ModernUIDensity.Default, title: localize2('layoutDensityDefault', "Default") },
	{ density: ModernUIDensity.Compact, title: localize2('layoutDensityCompact', "Compact") },
] as const;

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	title: localize('layoutDensity', "Layout Density"),
	submenu: LayoutDensityMenu,
	group: '2_configuration',
	order: 8,
	when: ContextKeyExpr.equals(`config.${LayoutSettings.MODERN_UI}`, true),
});

for (let index = 0; index < layoutDensityOptions.length; index++) {
	const option = layoutDensityOptions[index];
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `workbench.action.setLayoutDensity.${option.density}`,
				title: option.title,
				toggled: ContextKeyExpr.equals(`config.${LayoutSettings.MODERN_UI_DENSITY}`, option.density),
				menu: {
					id: LayoutDensityMenu,
					order: index + 1,
				},
			});
		}

		override run(accessor: ServicesAccessor): Promise<void> {
			return accessor.get(IConfigurationService).updateValue(LayoutSettings.MODERN_UI_DENSITY, option.density);
		}
	});
}

/**
 * The fixed catalog of built-in Modern UI modules. The CSS for each module
 * ships with the product (imported above), and all modules are enabled together
 * as part of the Modern UI experiment (`LayoutSettings.MODERN_UI`). This catalog
 * tracks per-module metadata such as whether a module affects layout.
 */
const MODERN_UI_MODULES: readonly IModernUIModule[] = [
	{ id: 'activityBar' },
	{ id: 'commandCenter' },
	{ id: 'editorBorder' },
	{ id: 'fontRamp' },
	{ id: 'keyboardFocusOnly' },
	{ id: 'padding' },
	{ id: 'paneHeaders', layoutAffecting: true },
	{ id: 'roundedCorners' },
	{ id: 'sashHandles' },
	{ id: 'scrollShadows' },
	{ id: 'shadows' },
	{ id: 'statusBar' },
	{ id: 'tabs' },
	{ id: 'titlebar' },
	{ id: 'notificationsDialogs' },
];

/**
 * A contribution that toggles the built-in CSS Modern UI modules on or off
 * as a group, based on the `workbench.experimental.modernUI` setting. When the
 * Modern UI Update experiment is enabled, all modules are applied together;
 * otherwise none are.
 */
export class ModernUIContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.modernUI';

	private readonly hasLayoutAffectingModule = MODERN_UI_MODULES.some(m => m.layoutAffecting);

	private layoutAffectingState = 'disabled';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.layoutAffectingState = this.getLayoutAffectingState();

		// A config change re-applies to every container (the global `update()`
		// covers all windows, including auxiliary ones).
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI) || e.affectsConfiguration(LayoutSettings.MODERN_UI_DENSITY) || e.affectsConfiguration(LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS)) {
				this.update();
				// Some modules change layout metrics, so a relayout is required once
				// their classes and corresponding layout values are updated.
				const layoutAffectingState = this.getLayoutAffectingState();
				if (layoutAffectingState !== this.layoutAffectingState) {
					this.layoutAffectingState = layoutAffectingState;
					this.layoutService.layout();
				}
			}
		}));

		// Apply the current selection to windows opened after startup (e.g.
		// auxiliary windows). Subsequent config changes are handled by `update()`.
		this._register(this.layoutService.onDidAddContainer(({ container }) => {
			const enabled = this.isEnabled();
			this.applyTo(container, enabled, enabled && this.isCompact(), enabled && this.useUppercaseViewHeaders());
		}));

		this.update();
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI) === true;
	}

	private useUppercaseViewHeaders(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS) === true;
	}

	private isCompact(): boolean {
		return this.configurationService.getValue<ModernUIDensity>(LayoutSettings.MODERN_UI_DENSITY) === ModernUIDensity.Compact;
	}

	private getLayoutAffectingState(): string {
		if (!this.isEnabled() || !this.hasLayoutAffectingModule) {
			return 'disabled';
		}

		return this.isCompact() ? ModernUIDensity.Compact : ModernUIDensity.Default;
	}

	private update(): void {
		const enabled = this.isEnabled();
		const compact = enabled && this.isCompact();
		const useUppercaseViewHeaders = enabled && this.useUppercaseViewHeaders();
		this.applyPaneHeaderSize(enabled);
		for (const container of this.layoutService.containers) {
			this.applyTo(container, enabled, compact, useUppercaseViewHeaders);
		}
		this.applyScrollbarSize(enabled);
		this.applyNotificationRowHeight(enabled);
	}

	private applyTo(container: HTMLElement, enabled: boolean, compact: boolean, useUppercaseViewHeaders: boolean): void {
		container.classList.toggle(MODERN_UI_CLASS, enabled);
		container.classList.toggle(MODERN_UI_COMPACT_CLASS, compact);
		container.classList.toggle(MODERN_UI_TABS_CLASS, enabled);
		container.classList.toggle(MODERN_UI_NOTIFICATIONS_DIALOGS_CLASS, enabled);
		container.classList.toggle(MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS, useUppercaseViewHeaders);
	}

	private applyScrollbarSize(enabled: boolean): void {
		setGlobalDefaultScrollbarSize(enabled ? MODERN_UI_SCROLLBAR_SIZE : DEFAULT_SCROLLBAR_SIZE);
	}

	private applyNotificationRowHeight(enabled: boolean): void {
		setNotificationRowHeight(enabled ? COMPACT_NOTIFICATION_ROW_HEIGHT : DEFAULT_NOTIFICATION_ROW_HEIGHT);
	}

	private applyPaneHeaderSize(enabled: boolean): void {
		let paneHeaderSize = DEFAULT_PANE_HEADER_SIZE;
		if (enabled) {
			paneHeaderSize = MODERN_UI_PANE_HEADER_SIZE;
		}
		setGlobalPaneHeaderSize(paneHeaderSize);
	}

	override dispose(): void {
		// Remove the class this contribution added so it leaves no DOM state behind.
		for (const container of this.layoutService.containers) {
			container.classList.remove(MODERN_UI_CLASS);
			container.classList.remove(MODERN_UI_COMPACT_CLASS);
			container.classList.remove(MODERN_UI_TABS_CLASS);
			container.classList.remove(MODERN_UI_NOTIFICATIONS_DIALOGS_CLASS);
			container.classList.remove(MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS);
		}
		setGlobalDefaultScrollbarSize(DEFAULT_SCROLLBAR_SIZE);
		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		setGlobalPaneHeaderSize(DEFAULT_PANE_HEADER_SIZE);
		super.dispose();
	}
}

registerWorkbenchContribution2(ModernUIContribution.ID, ModernUIContribution, WorkbenchPhase.BlockRestore);
