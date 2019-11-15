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
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface AccessibilityMetrics {
	enabled: boolean;
}
type AccessibilityMetricsClassification = {
	enabled: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
};

export class AccessibilityService extends AbstractAccessibilityService implements IAccessibilityService {

	_serviceBrand: undefined;

	private _accessibilitySupport = AccessibilitySupport.Unknown;
	private didSendTelemetry = false;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super(contextKeyService, configurationService);
		this.setAccessibilitySupport(environmentService.configuration.accessibilitySupport ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled);
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

		if (!this.didSendTelemetry && accessibilitySupport === AccessibilitySupport.Enabled) {
			this._telemetryService.publicLog2<AccessibilityMetrics, AccessibilityMetricsClassification>('accessibility', { enabled: true });
			this.didSendTelemetry = true;
		}
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this._accessibilitySupport;
	}
}

registerSingleton(IAccessibilityService, AccessibilityService, true);
