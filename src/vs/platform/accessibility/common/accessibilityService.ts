/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { AbstractAccessibilityService } from 'vs/platform/accessibility/common/abstractAccessibilityService';

export class BrowserAccessibilityService extends AbstractAccessibilityService implements IAccessibilityService {

	_serviceBrand: any;

	private _accessibilitySupport = AccessibilitySupport.Unknown;

	constructor(
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IConfigurationService readonly configurationService: IConfigurationService,
	) {
		super(contextKeyService, configurationService);
	}

	alwaysUnderlineAccessKeys(): Promise<boolean> {
		return Promise.resolve(false);
	}

	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void {
		if (this._accessibilitySupport === accessibilitySupport) {
			return;
		}

		this._accessibilitySupport = accessibilitySupport;
		this._onDidChangeAccessibilitySupport.fire();
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this._accessibilitySupport;
	}
}