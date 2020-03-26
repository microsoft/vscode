/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { QuickInputController } from 'vs/base/parts/quickinput/browser/quickInput';
import { QuickInputService as BaseQuickInputService } from 'vs/platform/quickinput/browser/quickInput';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { InQuickOpenContextKey } from 'vs/workbench/browser/quickopen';

export class QuickInputService extends BaseQuickInputService {

	private readonly inQuickOpenContext = InQuickOpenContextKey.bindTo(this.contextKeyService);

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILayoutService protected readonly layoutService: ILayoutService,
	) {
		super(instantiationService, contextKeyService, themeService, accessibilityService, layoutService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onShow(() => this.inQuickOpenContext.set(true)));
		this._register(this.onHide(() => this.inQuickOpenContext.set(false)));
	}

	protected createController(): QuickInputController {
		return super.createController(this.layoutService, {
			ignoreFocusOut: () => this.environmentService.args['sticky-quickopen'] || !this.configurationService.getValue('workbench.quickOpen.closeOnFocusLost'),
			backKeybindingLabel: () => this.keybindingService.lookupKeybinding('workbench.action.quickInputBack')?.getLabel() || undefined,
		});
	}
}

registerSingleton(IQuickInputService, QuickInputService, true);
