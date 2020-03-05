/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickInputService, IQuickPickItem, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickPick, IQuickInputButton, IInputBox, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder, badgeBackground, badgeForeground, contrastBorder, buttonForeground, buttonBackground, buttonHoverBackground, progressBarBackground, widgetShadow, listFocusForeground, listFocusBackground, activeContrastBorder, pickerGroupBorder, pickerGroupForeground, quickInputForeground, quickInputBackground, quickInputTitleBackground } from 'vs/platform/theme/common/colorRegistry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { computeStyles } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { QuickInputController, IQuickInputStyles } from 'vs/base/parts/quickinput/browser/quickInput';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { List, IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';

export class QuickInputService extends Themable implements IQuickInputService {

	_serviceBrand: undefined;

	get backButton(): IQuickInputButton { return this.controller.backButton; }

	get onShow() { return this.controller.onShow; }
	get onHide() { return this.controller.onHide; }

	private readonly controller: QuickInputController;
	private readonly contexts = new Map<string, IContextKey<boolean>>();

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super(themeService);

		this.controller = this._register(new QuickInputController({
			idPrefix: 'quickInput_', // Constant since there is still only one.
			container: this.layoutService.container,
			ignoreFocusOut: () => this.environmentService.args['sticky-quickopen'] || !this.configurationService.getValue('workbench.quickOpen.closeOnFocusLost'),
			isScreenReaderOptimized: () => this.accessibilityService.isScreenReaderOptimized(),
			backKeybindingLabel: () => this.keybindingService.lookupKeybinding('workbench.action.quickInputBack')?.getLabel() || undefined,
			setContextKey: (id?: string) => this.setContextKey(id),
			returnFocus: () => this.layoutService.focus(),
			createList: <T>(
				user: string,
				container: HTMLElement,
				delegate: IListVirtualDelegate<T>,
				renderers: IListRenderer<T, any>[],
				options: IListOptions<T>,
			) => this.instantiationService.createInstance(WorkbenchList, user, container, delegate, renderers, options) as List<T>,
			styles: this.computeStyles(),
		}));

		this.controller.layout(this.layoutService.dimension, this.layoutService.offset?.top ?? 0);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Layout changes
		this._register(this.layoutService.onLayout(dimension => this.controller.layout(dimension, this.layoutService.offset?.top ?? 0)));

		// Context keys
		this._register(this.controller.onShow(() => this.resetContextKeys()));
		this._register(this.controller.onHide(() => this.resetContextKeys()));
	}

	private setContextKey(id?: string) {
		let key: IContextKey<boolean> | undefined;
		if (id) {
			key = this.contexts.get(id);
			if (!key) {
				key = new RawContextKey<boolean>(id, false)
					.bindTo(this.contextKeyService);
				this.contexts.set(id, key);
			}
		}

		if (key && key.get()) {
			return; // already active context
		}

		this.resetContextKeys();

		if (key) {
			key.set(true);
		}
	}

	private resetContextKeys() {
		this.contexts.forEach(context => {
			if (context.get()) {
				context.reset();
			}
		});
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancellationToken = CancellationToken.None): Promise<O extends { canPickMany: true } ? T[] : T> {
		return this.controller.pick(picks, options, token);
	}

	input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string> {
		return this.controller.input(options, token);
	}

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		return this.controller.createQuickPick();
	}

	createInputBox(): IInputBox {
		return this.controller.createInputBox();
	}

	focus() {
		this.controller.focus();
	}

	toggle() {
		this.controller.toggle();
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration) {
		this.controller.navigate(next, quickNavigate);
	}

	accept() {
		return this.controller.accept();
	}

	back() {
		return this.controller.back();
	}

	cancel() {
		return this.controller.cancel();
	}

	hide(focusLost?: boolean): void {
		return this.controller.hide(focusLost);
	}

	protected updateStyles() {
		this.controller.applyStyles(this.computeStyles());
	}

	private computeStyles(): IQuickInputStyles {
		return {
			widget: {
				...computeStyles(this.theme, {
					quickInputBackground,
					quickInputForeground,
					contrastBorder,
					widgetShadow,
					quickInputTitleBackground
				}),
			},
			inputBox: computeStyles(this.theme, {
				inputForeground,
				inputBackground,
				inputBorder,
				inputValidationInfoBackground,
				inputValidationInfoForeground,
				inputValidationInfoBorder,
				inputValidationWarningBackground,
				inputValidationWarningForeground,
				inputValidationWarningBorder,
				inputValidationErrorBackground,
				inputValidationErrorForeground,
				inputValidationErrorBorder
			}),
			countBadge: computeStyles(this.theme, {
				badgeBackground,
				badgeForeground,
				badgeBorder: contrastBorder
			}),
			button: computeStyles(this.theme, {
				buttonForeground,
				buttonBackground,
				buttonHoverBackground,
				buttonBorder: contrastBorder
			}),
			progressBar: computeStyles(this.theme, {
				progressBarBackground
			}),
			list: computeStyles(this.theme, {
				listBackground: quickInputBackground,
				// Look like focused when inactive.
				listInactiveFocusForeground: listFocusForeground,
				listInactiveFocusBackground: listFocusBackground,
				listFocusOutline: activeContrastBorder,
				listInactiveFocusOutline: activeContrastBorder,
				pickerGroupBorder,
				pickerGroupForeground
			}),
		};
	}
}
