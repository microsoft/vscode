/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AccessibilityWorkbenchSettingId, ViewDimUnfocusedOpacityProperties } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

export class UnfocusedViewDimmingContribution extends Disposable implements IWorkbenchContribution {
	private _styleElement?: HTMLStyleElement;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._register(toDisposable(() => this._removeStyleElement()));

		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (e && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.ViewDimUnfocusedEnabled) && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.ViewDimUnfocusedOpacity)) {
				return;
			}

			let cssTextContent = '';

			const enabled = ensureBoolean(configurationService.getValue(AccessibilityWorkbenchSettingId.ViewDimUnfocusedEnabled), false);
			if (enabled) {
				const opacity = clamp(
					ensureNumber(configurationService.getValue(AccessibilityWorkbenchSettingId.ViewDimUnfocusedOpacity), ViewDimUnfocusedOpacityProperties.Default),
					ViewDimUnfocusedOpacityProperties.Minimum,
					ViewDimUnfocusedOpacityProperties.Maximum
				);

				if (opacity !== 1) {
					const rules = new Set<string>();
					const filterRule = `filter: opacity(${opacity});`;
					// Terminal tabs
					rules.add(`.monaco-workbench .pane-body.integrated-terminal:not(:focus-within) .tabs-container { ${filterRule} }`);
					// Terminals
					rules.add(`.monaco-workbench .pane-body.integrated-terminal .terminal-wrapper:not(:focus-within) { ${filterRule} }`);
					// Text editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor { ${filterRule} }`);
					// Terminal editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .terminal-wrapper { ${filterRule} }`);
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
			this._styleElement = document.createElement('style');
			this._styleElement.className = 'accessibilityUnfocusedViewOpacity';
			document.head.appendChild(this._styleElement);
		}
		return this._styleElement;
	}

	private _removeStyleElement(): void {
		this._styleElement?.remove();
		this._styleElement = undefined;
	}
}


function ensureBoolean(value: unknown, defaultValue: boolean): boolean {
	return typeof value === 'boolean' ? value : defaultValue;
}

function ensureNumber(value: unknown, defaultValue: number): number {
	return typeof value === 'number' ? value : defaultValue;
}
