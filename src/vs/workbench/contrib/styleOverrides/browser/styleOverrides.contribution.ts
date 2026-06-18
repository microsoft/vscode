/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';

// Bundle the CSS for every style-override module. Each file gates all of its
// rules behind a `.style-override-<id>` ancestor class, so the styles are inert
// until the matching class is toggled onto the workbench container(s) below.
import './media/activityBar.css';
import './media/fontRamp.css';
import './media/paneHeaders.css';
import './media/roundedCorners.css';
import './media/tabs.css';

const SETTING_ID = 'workbench.experimental.styleOverrides';

interface IStyleOverrideModule {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

/**
 * The fixed catalog of available style-override experiments. The CSS for each
 * module ships with the product (imported above) and is gated behind the
 * `.style-override-<id>` class. Users can only enable modules from this list;
 * arbitrary CSS cannot be injected.
 */
const STYLE_OVERRIDE_MODULES: readonly IStyleOverrideModule[] = [
	{
		id: 'activityBar',
		label: localize('styleOverrides.activityBar', "Activity Bar"),
		description: localize('styleOverrides.activityBar.description', "Replaces the active activity bar item's left highlight border with a rounded background behind the icon.")
	},
	{
		id: 'fontRamp',
		label: localize('styleOverrides.fontRamp', "Font Ramp"),
		description: localize('styleOverrides.fontRamp.description', "Applies a unified typographic ramp across the workbench: headings at 26/18px, 13px body, 12px section titles and tabs, 11px metadata and 10px badges.")
	},
	{
		id: 'paneHeaders',
		label: localize('styleOverrides.paneHeaders', "Pane Headers"),
		description: localize('styleOverrides.paneHeaders.description', "Insets the view pane header separators, rounds their corners and adds a background tint on hover.")
	},
	{
		id: 'roundedCorners',
		label: localize('styleOverrides.roundedCorners', "Rounded Corners"),
		description: localize('styleOverrides.roundedCorners.description', "Applies a three-tier corner radius system: 8px for overlays (quick input, hovers, menus, dialogs), 6px for non-control containers and 4px for interactable controls (inputs, lists).")
	},
	{
		id: 'tabs',
		label: localize('styleOverrides.tabs', "Agents Window Tabs"),
		description: localize('styleOverrides.tabs.description', "Styles editor tabs as transparent, rounded pills to match the Agents window.")
	}
];

function classNameFor(moduleId: string): string {
	return `style-override-${moduleId}`;
}

/**
 * A development-oriented contribution that toggles built-in CSS style-override
 * modules on or off based on the `workbench.experimental.styleOverrides` setting.
 *
 * Unlike a free-form CSS loader, the available styles are fixed and shipped with
 * the product. The setting merely selects which of the predefined modules are
 * active, so the styling itself cannot be changed by end users.
 */
export class StyleOverridesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.styleOverrides';

	private readonly knownModuleIds = new Set(STYLE_OVERRIDE_MODULES.map(m => m.id));
	private readonly knownClassNames = STYLE_OVERRIDE_MODULES.map(m => classNameFor(m.id));

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService,
	) {
		super();

		// A config change re-applies to every container (the global `update()`
		// covers all windows, including auxiliary ones).
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SETTING_ID)) {
				this.update();
			}
		}));

		// Apply the current selection to windows opened after startup (e.g.
		// auxiliary windows). Subsequent config changes are handled by `update()`.
		this._register(this.layoutService.onDidAddContainer(({ container }) => {
			this.applyTo(container, this.activeClassNames());
		}));

		this.update();
	}

	private activeClassNames(): Set<string> {
		const selection = this.configurationService.getValue<string[]>(SETTING_ID);
		const active = new Set<string>();
		if (Array.isArray(selection)) {
			for (const id of selection) {
				if (this.knownModuleIds.has(id)) {
					active.add(classNameFor(id));
				}
			}
		}
		return active;
	}

	private update(): void {
		const active = this.activeClassNames();
		for (const container of this.layoutService.containers) {
			this.applyTo(container, active);
		}
	}

	private applyTo(container: HTMLElement, active: Set<string>): void {
		for (const className of this.knownClassNames) {
			container.classList.toggle(className, active.has(className));
		}
	}

	override dispose(): void {
		// Remove any classes this contribution added so it leaves no DOM state behind.
		for (const container of this.layoutService.containers) {
			for (const className of this.knownClassNames) {
				container.classList.remove(className);
			}
		}
		super.dispose();
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[SETTING_ID]: {
			type: 'array',
			items: {
				type: 'string',
				enum: STYLE_OVERRIDE_MODULES.map(m => m.id),
				enumDescriptions: STYLE_OVERRIDE_MODULES.map(m => `${m.label}: ${m.description}`)
			},
			uniqueItems: true,
			default: [],
			tags: ['experimental'],
			markdownDescription: localize('styleOverrides', "Enables one or more built-in style-override modules that adjust the appearance of the workbench. Each module is a predefined set of styles that ships with the product; only modules from this list can be enabled and the styles themselves cannot be customized. Leave empty to disable all overrides. This is an experimental setting intended for trying out style ideas.")
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StyleOverridesContribution, LifecyclePhase.Restored);
