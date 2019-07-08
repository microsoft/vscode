/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IAccessibilityService, AccessibilitySupport, CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class BrowserAccessibilityService extends Disposable implements IAccessibilityService {

	_serviceBrand: any;

	private _accessibilitySupport = AccessibilitySupport.Unknown;
	private _accessibilityModeEnabledContext: IContextKey<boolean>;
	private readonly _onDidChangeAccessibilitySupport = new Emitter<void>();
	readonly onDidChangeAccessibilitySupport: Event<void> = this._onDidChangeAccessibilitySupport.event;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._accessibilityModeEnabledContext = CONTEXT_ACCESSIBILITY_MODE_ENABLED.bindTo(this._contextKeyService);
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.accessibilitySupport')) {
				this._updateContextKey();
			}
		}));
		this._updateContextKey();
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
		this._updateContextKey();
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this._accessibilitySupport;
	}

	private _updateContextKey(): void {
		const detected = this.getAccessibilitySupport() === AccessibilitySupport.Enabled;
		const config = this._configurationService.getValue('editor.accessibilitySupport');
		this._accessibilityModeEnabledContext.set(config === 'on' || (config === 'auto' && detected));
	}
}