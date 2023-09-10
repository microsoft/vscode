/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AccessibilitySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

export class UnfocusedViewDimmingContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const elStyle = document.createElement('style');
		elStyle.className = 'accessibilityUnfocusedViewOpacity';
		document.head.appendChild(elStyle);
		this._register(toDisposable(() => elStyle.remove()));

		this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, e => {
			if (e && !e.affectsConfiguration(AccessibilitySettingId.UnfocusedViewOpacity)) {
				return;
			}

			let opacity: number;
			const opacityConfig = configurationService.getValue(AccessibilitySettingId.UnfocusedViewOpacity);
			if (typeof opacityConfig !== 'number') {
				opacity = 1;
			} else {
				opacity = clamp(opacityConfig, 0.2, 1);
			}

			let cssTextContent = '';

			// Only add the styles if the feature is used
			if (opacity !== 1) {
				const rules = new Set<string>();
				if (opacity !== 1) {
					const filterRule = `filter: opacity(${opacity});`;
					// Terminal tabs
					rules.add(`.monaco-workbench .pane-body.integrated-terminal:not(:focus-within) .tabs-container { ${filterRule} }`);
					// Terminals
					rules.add(`.monaco-workbench .pane-body.integrated-terminal .terminal-wrapper:not(:focus-within) { ${filterRule} }`);
					// Text editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor { ${filterRule} }`);
					// Terminal editors
					rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .terminal-wrapper { ${filterRule} }`);
				}
				cssTextContent = [...rules].join('\n');
			}

			elStyle.textContent = cssTextContent;
		}));
	}
}
