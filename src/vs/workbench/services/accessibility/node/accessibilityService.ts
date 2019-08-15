/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { isWindows } from 'vs/base/common/platform';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AbstractAccessibilityService } from 'vs/platform/accessibility/common/abstractAccessibilityService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class AccessibilityService extends AbstractAccessibilityService implements IAccessibilityService {

	_serviceBrand!: ServiceIdentifier<any>;

	private _accessibilitySupport = AccessibilitySupport.Unknown;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IConfigurationService readonly configurationService: IConfigurationService
	) {
		super(contextKeyService, configurationService);
	}

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
			const config = this.environmentService.configuration;
			this._accessibilitySupport = (config && config.accessibilitySupport) ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled;
		}

		return this._accessibilitySupport;
	}
}

registerSingleton(IAccessibilityService, AccessibilityService, true);
