/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { IQuickInputOptions, IQuickInputStyles, QuickInputController } from 'vs/base/parts/quickinput/browser/quickInput';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IWorkbenchListOptions, WorkbenchList } from 'vs/platform/list/browser/listService';
import { QuickAccessController } from 'vs/platform/quickinput/browser/quickAccess';
import { IQuickAccessController } from 'vs/platform/quickinput/common/quickAccess';
import { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInputButton, IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { activeContrastBorder, badgeBackground, badgeForeground, buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationWarningForeground, keybindingLabelBackground, keybindingLabelBorder, keybindingLabelBottomBorder, keybindingLabelForeground, pickerGroupBorder, pickerGroupForeground, progressBarBackground, quickInputBackground, quickInputForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, quickInputTitleBackground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { computeStyles } from 'vs/platform/theme/common/styler';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';

export interface IQuickInputControllerHost extends ILayoutService { }

export class QuickInputService extends Themable implements IQuickInputService {

	declare readonly _serviceBrand: undefined;

	get backButton(): IQuickInputButton { return this.controller.backButton; }

	private readonly _onShow = this._register(new Emitter<void>());
	readonly onShow = this._onShow.event;

	private readonly _onHide = this._register(new Emitter<void>());
	readonly onHide = this._onHide.event;

	private _controller: QuickInputController | undefined;
	private get controller(): QuickInputController {
		if (!this._controller) {
			this._controller = this._register(this.createController());
		}

		return this._controller;
	}

	private get hasController() { return !!this._controller; }

	private _quickAccess: IQuickAccessController | undefined;
	get quickAccess(): IQuickAccessController {
		if (!this._quickAccess) {
			this._quickAccess = this._register(this.instantiationService.createInstance(QuickAccessController));
		}

		return this._quickAccess;
	}

	private readonly contexts = new Map<string, IContextKey<boolean>>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ILayoutService protected readonly layoutService: ILayoutService
	) {
		super(themeService);
	}

	protected createController(host: IQuickInputControllerHost = this.layoutService, options?: Partial<IQuickInputOptions>): QuickInputController {
		const defaultOptions: IQuickInputOptions = {
			idPrefix: 'quickInput_', // Constant since there is still only one.
			container: host.container,
			ignoreFocusOut: () => false,
			isScreenReaderOptimized: () => this.accessibilityService.isScreenReaderOptimized(),
			backKeybindingLabel: () => undefined,
			setContextKey: (id?: string) => this.setContextKey(id),
			returnFocus: () => host.focus(),
			createList: <T>(
				user: string,
				container: HTMLElement,
				delegate: IListVirtualDelegate<T>,
				renderers: IListRenderer<T, any>[],
				options: IWorkbenchListOptions<T>,
			) => this.instantiationService.createInstance(WorkbenchList, user, container, delegate, renderers, options) as List<T>,
			styles: this.computeStyles()
		};

		const controller = this._register(new QuickInputController({
			...defaultOptions,
			...options
		}));

		controller.layout(host.dimension, host.offset.quickPickTop);

		// Layout changes
		this._register(host.onDidLayout(dimension => controller.layout(dimension, host.offset.quickPickTop)));

		// Context keys
		this._register(controller.onShow(() => {
			this.resetContextKeys();
			this._onShow.fire();
		}));
		this._register(controller.onHide(() => {
			this.resetContextKeys();
			this._onHide.fire();
		}));

		return controller;
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

		key?.set(true);
	}

	private resetContextKeys() {
		this.contexts.forEach(context => {
			if (context.get()) {
				context.reset();
			}
		});
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancellationToken = CancellationToken.None): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
		return this.controller.pick(picks, options, token);
	}

	input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
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

	accept(keyMods?: IKeyMods) {
		return this.controller.accept(keyMods);
	}

	back() {
		return this.controller.back();
	}

	cancel() {
		return this.controller.cancel();
	}

	protected override updateStyles() {
		if (this.hasController) {
			this.controller.applyStyles(this.computeStyles());
		}
	}

	private computeStyles(): IQuickInputStyles {
		return {
			widget: {
				...computeStyles(this.theme, {
					quickInputBackground,
					quickInputForeground,
					quickInputTitleBackground,
					contrastBorder,
					widgetShadow
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
			keybindingLabel: computeStyles(this.theme, {
				keybindingLabelBackground,
				keybindingLabelForeground,
				keybindingLabelBorder,
				keybindingLabelBottomBorder,
				keybindingLabelShadow: widgetShadow
			}),
			list: computeStyles(this.theme, {
				listBackground: quickInputBackground,
				// Look like focused when inactive.
				listInactiveFocusForeground: quickInputListFocusForeground,
				listInactiveSelectionIconForeground: quickInputListFocusIconForeground,
				listInactiveFocusBackground: quickInputListFocusBackground,
				listFocusOutline: activeContrastBorder,
				listInactiveFocusOutline: activeContrastBorder,
				pickerGroupBorder,
				pickerGroupForeground
			})
		};
	}
}
