/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchLayoutService, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { DEFAULT_SCROLLBAR_SIZE, setGlobalDefaultScrollbarSize } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';

/** Reduced scrollbar size (px) applied when the style-override experiment is on. */
const SCROLLBAR_OVERRIDE_SIZE = 8;

// Bundle the CSS for every style-override module. Every file gates all of its
// rules behind the single `.style-override` ancestor class, so the styles are
// inert until that class is toggled onto the workbench container(s) below.
import './media/activityBar.css';
import './media/commandCenter.css';
import './media/editorBorder.css';
import './media/fontRamp.css';
import './media/keyboardFocusOnly.css';
import './media/padding.css';
import './media/paneHeaders.css';
import './media/roundedCorners.css';
import './media/sashHandles.css';
import './media/scrollShadows.css';
import './media/shadows.css';
import './media/statusBar.css';
import './media/tabs.css';
import './media/titlebar.css';

interface IStyleOverrideModule {
	readonly id: string;
	/**
	 * Whether this module changes layout-affecting CSS variables (e.g. the pane
	 * header size). Toggling such a module requires a workbench relayout so the
	 * new values are read; modules without this flag only affect appearance.
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
	{ id: 'titlebar' }
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
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
				this.update();
				// Some modules drive layout-affecting CSS variables (e.g. the
				// `paneHeaders` header size) that the JS layout reads back, so a
				// relayout is required once the classes are toggled. The base layout
				// (`Layout`) also relayouts for this same setting, but its listener
				// runs earlier (startup) than this contribution's (Restored phase),
				// so that pass happens *before* these classes are applied and reads
				// stale values. This relayout therefore runs last and is the
				// authoritative one — do not remove it as "redundant". Guarded so it
				// only fires when the enabled state actually flips.
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
			this.applyTo(container, this.isEnabled());
		}));

		this.update();
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI) === true;
	}

	private hasActiveLayoutAffectingModule(): boolean {
		return this.isEnabled() && this.hasLayoutAffectingModule;
	}

	private update(): void {
		const enabled = this.isEnabled();
		for (const container of this.layoutService.containers) {
			this.applyTo(container, enabled);
		}
		this.applyScrollbarSize(enabled);
	}

	private applyTo(container: HTMLElement, enabled: boolean): void {
		container.classList.toggle(STYLE_OVERRIDE_CLASS, enabled);
	}

	private applyScrollbarSize(enabled: boolean): void {
		setGlobalDefaultScrollbarSize(enabled ? SCROLLBAR_OVERRIDE_SIZE : DEFAULT_SCROLLBAR_SIZE);
	}

	override dispose(): void {
		// Remove the class this contribution added so it leaves no DOM state behind.
		for (const container of this.layoutService.containers) {
			container.classList.remove(STYLE_OVERRIDE_CLASS);
		}
		setGlobalDefaultScrollbarSize(DEFAULT_SCROLLBAR_SIZE);
		super.dispose();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StyleOverridesContribution, LifecyclePhase.Restored);
