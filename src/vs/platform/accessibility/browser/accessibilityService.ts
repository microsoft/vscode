/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IAccessibilityService } from '../common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export class AccessibilityService extends Disposable implements IAccessibilityService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeEnhancedFocus = this._register(new Emitter<boolean>());
	readonly onDidChangeEnhancedFocus: Event<boolean> = this._onDidChangeEnhancedFocus.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.enhancedFocus')) {
				this._updateEnhancedFocus();
			}
		}));

		this._updateEnhancedFocus();
	}

	private _updateEnhancedFocus(): void {
		const enhancedFocus = this.configurationService.getValue<boolean>('accessibility.enhancedFocus');
		if (enhancedFocus) {
			this.layoutService.mainContainer.classList.add('enhanced-focus');
		} else {
			this.layoutService.mainContainer.classList.remove('enhanced-focus');
		}
		this._onDidChangeEnhancedFocus.fire(!!enhancedFocus);
	}

	isScreenReaderOptimized(): boolean {
		 
		return false; 
	}

	alert(message: string): void {
		
	}
}
