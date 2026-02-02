/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { QuickInputController } from 'vs/platform/quickinput/browser/quickInputController';
import { QuickInputService as BaseQuickInputService } from 'vs/platform/quickinput/browser/quickInputService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { InQuickPickContextKey } from 'vs/workbench/browser/quickaccess';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IHoverDelegate, IHoverDelegateOptions, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';

export class QuickInputService extends BaseQuickInputService {

	private readonly hoverDelegate = new QuickInputHoverDelegate(this.configurationService, this.hoverService);
	private readonly inQuickInputContext = InQuickPickContextKey.bindTo(this.contextKeyService);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ILayoutService layoutService: ILayoutService,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super(instantiationService, contextKeyService, themeService, layoutService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onShow(() => this.inQuickInputContext.set(true)));
		this._register(this.onHide(() => this.inQuickInputContext.set(false)));
	}

	protected override createController(): QuickInputController {
		return super.createController(this.layoutService, {
			ignoreFocusOut: () => !this.configurationService.getValue('workbench.quickOpen.closeOnFocusLost'),
			backKeybindingLabel: () => this.keybindingService.lookupKeybinding('workbench.action.quickInputBack')?.getLabel() || undefined,
			hoverDelegate: this.hoverDelegate
		});
	}
}

class QuickInputHoverDelegate implements IHoverDelegate {
	private lastHoverHideTime = 0;
	readonly placement = 'element';

	get delay() {
		if (Date.now() - this.lastHoverHideTime < 200) {
			return 0; // show instantly when a hover was recently shown
		}

		return this.configurationService.getValue<number>('workbench.hover.delay');
	}

	constructor(
		private readonly configurationService: IConfigurationService,
		private readonly hoverService: IHoverService
	) { }

	showHover(options: IHoverDelegateOptions, focus?: boolean): IHoverWidget | undefined {
		return this.hoverService.showHover({
			...options,
			showHoverHint: true,
			hideOnKeyDown: false,
			skipFadeInAnimation: true,
		}, focus);
	}

	onDidHideHover(): void {
		this.lastHoverHideTime = Date.now();
	}
}

registerSingleton(IQuickInputService, QuickInputService, InstantiationType.Delayed);
