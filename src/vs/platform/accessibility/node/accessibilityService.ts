/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { isWindows } from 'vs/base/common/platform';
import { Emitter, Event } from 'vs/base/common/event';
import { IWindowService } from 'vs/platform/windows/common/windows';

export class AccessibilityService implements IAccessibilityService {
	_serviceBrand: any;

	private _accessibilitySupport = AccessibilitySupport.Unknown;
	private readonly _onDidChangeAccessibilitySupport = new Emitter<void>();
	readonly onDidChangeAccessibilitySupport: Event<void> = this._onDidChangeAccessibilitySupport.event;

	constructor(
		@IWindowService private readonly windowService: IWindowService
	) { }

	alwaysUnderlineAccessKeys(): Promise<boolean> {
		if (!isWindows) {
			return Promise.resolve(false);
		}

		return new Promise<boolean>(async (resolve) => {
			const Registry = await import('vscode-windows-registry');

			let value;
			try {
				value = Registry.GetStringRegKey('HKEY_CURRENT_USER', 'Control Panel\\Accessibility\\Keyboard Preference', 'On');
			} catch {
				resolve(false);
			}

			resolve(value === '1');
		});
	}

	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void {
		if (this._accessibilitySupport === accessibilitySupport) {
			return;
		}

		this._accessibilitySupport = accessibilitySupport;
		this._onDidChangeAccessibilitySupport.fire();
	}

	getAccessibilitySupport(): AccessibilitySupport {
		if (this._accessibilitySupport === AccessibilitySupport.Unknown) {
			const config = this.windowService.getConfiguration();
			this._accessibilitySupport = (config && config.accessibilitySupport) ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled;

		}

		return this._accessibilitySupport;
	}
}