/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AccessibilityWorkbenchSettingId, ViewDimUnfocusedOpacityProperties } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

export class UnfocusedViewDimmingContribution extends Disposable implements IWorkbenchContribution {
	private _styleElement?: HTMLStyleElement;
	private _styleElementDisposables: DisposableStore | undefined = undefined;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._register(toDisposable(() => this._removeStyleElement()));

		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (e && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.DimUnfocusedEnabled) && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.DimUnfocusedOpacity)) {
				return;
			}

			let cssTextContent = '';

			const enabled = ensureBoolean(configurationService.getValue(AccessibilityWorkbenchSettingId.DimUnfocusedEnabled), false);
			if (enabled) {
				const opacity = clamp(
					ensureNumber(configurationService.getValue(AccessibilityWorkbenchSettingId.DimUnfocusedOpacity), ViewDimUnfocusedOpacityProperties.Default),
					ViewDimUnfocusedOpacityProperties.Minimum,
					ViewDimUnfocusedOpacityProperties.Maximum
				);

				if (opacity !== 1) {
					// These filter rules are more specific than may be expected as the `filter`
					// rule can cause problems if it's used inside the element like on editor hovers
					const rules = new Set<string>();
					const filterRule = `filter: opacity(${opacity});`;
					// Terminal tabs
					rules.add(`.monaco-workbench .pane-body.integrated-terminal:not(:focus-within) .tabs-container { ${filterRule} }`);
					// Terminals
					rules.add(`.monaco-workbench .pane-body.integrated-terminal .terminal-wrapper:not(:focus-within) { ${filterRule} }`);
					// Text editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor { ${filterRule} }`);
					// Breadcrumbs
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .breadcrumbs-below-tabs { ${filterRule} }`);
					// Terminal editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .terminal-wrapper { ${filterRule} }`);
					// Settings editor
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .settings-editor { ${filterRule} }`);
					// Keybindings editor
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .keybindings-editor { ${filterRule} }`);
					// Editor placeholder (error case)
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor-pane-placeholder { ${filterRule} }`);
					// Welcome editor
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .gettingStartedContainer { ${filterRule} }`);
					cssTextContent = [...rules].join('\n');
				}

			}

			if (cssTextContent.length === 0) {
				this._removeStyleElement();
			} else {
				this._getStyleElement().textContent = cssTextContent;
			}
		}));
	}

	private _getStyleElement(): HTMLStyleElement {
		if (!this._styleElement) {
			this._styleElementDisposables = new DisposableStore();
			this._styleElement = createStyleSheet(undefined, undefined, this._styleElementDisposables);
			this._styleElement.className = 'accessibilityUnfocusedViewOpacity';
		}
		return this._styleElement;
	}

	private _removeStyleElement(): void {
		this._styleElementDisposables?.dispose();
		this._styleElementDisposables = undefined;
		this._styleElement = undefined;
	}
}


function ensureBoolean(value: unknown, defaultValue: boolean): boolean {
	return typeof value === 'boolean' ? value : defaultValue;
}

function ensureNumber(value: unknown, defaultValue: number): number {
	return typeof value === 'number' ? value : defaultValue;
}
