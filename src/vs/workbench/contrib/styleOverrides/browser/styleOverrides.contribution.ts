/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchLayoutService, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DEFAULT_SCROLLBAR_SIZE, setGlobalDefaultScrollbarSize } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DEFAULT_NOTIFICATION_ROW_HEIGHT, setNotificationRowHeight } from '../../../browser/parts/notifications/notificationsViewer.js';
import { DEFAULT_PANE_HEADER_SIZE, setGlobalPaneHeaderSize } from '../../../../base/browser/ui/splitview/paneview.js';

/** Reduced scrollbar size (px) applied when the style-override experiment is on. */
const SCROLLBAR_OVERRIDE_SIZE = 8;

/** Reduced collapsed notification row height (px) applied when the style-override experiment is on. */
const NOTIFICATION_ROW_OVERRIDE_HEIGHT = 34;

/** Increased pane header size (px) applied when the style-override experiment is on. */
const PANE_HEADER_OVERRIDE_SIZE = 28;

// Bundle the CSS for every style-override module. Every file gates all of its
// rules behind the single `.style-override` ancestor class, so the styles are
// inert until that class is toggled onto the workbench container(s) below.
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

interface IStyleOverrideModule {
	readonly id: string;
	/**
	 * Whether this module changes layout metrics. Toggling such a module requires
	 * a workbench relayout; modules without this flag only affect appearance.
	 */
	readonly layoutAffecting?: boolean;
}

/**
 * The single class toggled onto the workbench container(s) when the Modern UI
 * Update experiment is enabled. Every style-override module's CSS is gated
 * behind this class (`.style-override ...`), so all modules are applied together
 * as a group.
 */
const STYLE_OVERRIDE_CLASS = 'style-override';
const MODERN_UI_TABS_CLASS = 'modern-ui-tabs';
const MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS = 'modern-ui-uppercase-view-headers';

/**
 * The fixed catalog of built-in style-override modules. The CSS for each module
 * ships with the product (imported above) and is gated behind the shared
 * `.style-override` class. All modules are enabled together as part of the
 * Modern UI Update experiment (`LayoutSettings.MODERN_UI`). This catalog is
 * retained to track per-module metadata (e.g. whether a module is
 * layout-affecting).
 */
const STYLE_OVERRIDE_MODULES: readonly IStyleOverrideModule[] = [
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
 * A contribution that toggles the built-in CSS style-override modules on or off
 * as a group, based on the `workbench.experimental.modernUI` setting. When the
 * Modern UI Update experiment is enabled, all modules are applied together;
 * otherwise none are.
 */
export class StyleOverridesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.styleOverrides';

	private readonly hasLayoutAffectingModule = STYLE_OVERRIDE_MODULES.some(m => m.layoutAffecting);

	/** Whether a layout-affecting module was active at the last applied selection. */
	private layoutAffectingActive = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.layoutAffectingActive = this.hasActiveLayoutAffectingModule();

		// A config change re-applies to every container (the global `update()`
		// covers all windows, including auxiliary ones).
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI) || e.affectsConfiguration(LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS)) {
				this.update();
				// Some modules change layout metrics, so a relayout is required once
				// their classes and corresponding layout values are updated.
				const layoutAffectingActive = this.hasActiveLayoutAffectingModule();
				if (layoutAffectingActive !== this.layoutAffectingActive) {
					this.layoutAffectingActive = layoutAffectingActive;
					this.layoutService.layout();
				}
			}
		}));

		// Apply the current selection to windows opened after startup (e.g.
		// auxiliary windows). Subsequent config changes are handled by `update()`.
		this._register(this.layoutService.onDidAddContainer(({ container }) => {
			const enabled = this.isEnabled();
			this.applyTo(container, enabled, enabled && this.useUppercaseViewHeaders());
		}));

		this.update();
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI) === true;
	}

	private useUppercaseViewHeaders(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI_UPPERCASE_VIEW_HEADERS) === true;
	}

	private hasActiveLayoutAffectingModule(): boolean {
		return this.isEnabled() && this.hasLayoutAffectingModule;
	}

	private update(): void {
		const enabled = this.isEnabled();
		const useUppercaseViewHeaders = enabled && this.useUppercaseViewHeaders();
		this.applyPaneHeaderSize(enabled);
		for (const container of this.layoutService.containers) {
			this.applyTo(container, enabled, useUppercaseViewHeaders);
		}
		this.applyScrollbarSize(enabled);
		this.applyNotificationRowHeight(enabled);
	}

	private applyTo(container: HTMLElement, enabled: boolean, useUppercaseViewHeaders: boolean): void {
		container.classList.toggle(STYLE_OVERRIDE_CLASS, enabled);
		container.classList.toggle(MODERN_UI_TABS_CLASS, enabled);
		container.classList.toggle(MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS, useUppercaseViewHeaders);
	}

	private applyScrollbarSize(enabled: boolean): void {
		setGlobalDefaultScrollbarSize(enabled ? SCROLLBAR_OVERRIDE_SIZE : DEFAULT_SCROLLBAR_SIZE);
	}

	private applyNotificationRowHeight(enabled: boolean): void {
		setNotificationRowHeight(enabled ? NOTIFICATION_ROW_OVERRIDE_HEIGHT : DEFAULT_NOTIFICATION_ROW_HEIGHT);
	}

	private applyPaneHeaderSize(enabled: boolean): void {
		setGlobalPaneHeaderSize(enabled ? PANE_HEADER_OVERRIDE_SIZE : DEFAULT_PANE_HEADER_SIZE);
	}

	override dispose(): void {
		// Remove the class this contribution added so it leaves no DOM state behind.
		for (const container of this.layoutService.containers) {
			container.classList.remove(STYLE_OVERRIDE_CLASS);
			container.classList.remove(MODERN_UI_TABS_CLASS);
			container.classList.remove(MODERN_UI_UPPERCASE_VIEW_HEADERS_CLASS);
		}
		setGlobalDefaultScrollbarSize(DEFAULT_SCROLLBAR_SIZE);
		setNotificationRowHeight(DEFAULT_NOTIFICATION_ROW_HEIGHT);
		setGlobalPaneHeaderSize(DEFAULT_PANE_HEADER_SIZE);
		super.dispose();
	}
}

registerWorkbenchContribution2(StyleOverridesContribution.ID, StyleOverridesContribution, WorkbenchPhase.BlockRestore);
