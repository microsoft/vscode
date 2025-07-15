/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { IOpenerService } from '../../opener/common/opener.js';
import { QuickAccessController } from './quickAccess.js';
import { IQuickAccessController } from '../common/quickAccess.js';
import { IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInputButton, IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickWidget, QuickPickInput } from '../common/quickInput.js';
import { defaultButtonStyles, defaultCountBadgeStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultProgressBarStyles, defaultToggleStyles, getListStyles } from '../../theme/browser/defaultStyles.js';
import { activeContrastBorder, asCssVariable, pickerGroupBorder, pickerGroupForeground, quickInputBackground, quickInputForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, quickInputTitleBackground, widgetBorder, widgetShadow } from '../../theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../theme/common/themeService.js';
import { IQuickInputOptions, IQuickInputStyles, QuickInputHoverDelegate } from './quickInput.js';
import { QuickInputController, IQuickInputControllerHost } from './quickInputController.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { getWindow } from '../../../base/browser/dom.js';

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
	get currentQuickInput() { return this.controller.currentQuickInput; }

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
		@ILayoutService protected readonly layoutService: ILayoutService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
	) {
		super(themeService);
	}

	protected createController(host: IQuickInputControllerHost = this.layoutService, options?: Partial<IQuickInputOptions>): QuickInputController {
		const defaultOptions: IQuickInputOptions = {
			idPrefix: 'quickInput_',
			container: host.activeContainer,
			ignoreFocusOut: () => false,
			backKeybindingLabel: () => undefined,
			setContextKey: (id?: string) => this.setContextKey(id),
			linkOpenerDelegate: (content) => {
				// HACK: https://github.com/microsoft/vscode/issues/173691
				this.instantiationService.invokeFunction(accessor => {
					const openerService = accessor.get(IOpenerService);
					openerService.open(content, { allowCommands: true, fromUserGesture: true });
				});
			},
			returnFocus: () => host.focus(),
			styles: this.computeStyles(),
			hoverDelegate: this._register(this.instantiationService.createInstance(QuickInputHoverDelegate))
		};

		const controller = this._register(this.instantiationService.createInstance(
			QuickInputController,
			{
				...defaultOptions,
				...options
			}
		));

		controller.layout(host.activeContainerDimension, host.activeContainerOffset.quickPickTop);

		// Layout changes
		this._register(host.onDidLayoutActiveContainer(dimension => {
			if (getWindow(host.activeContainer) === getWindow(controller.container)) {
				controller.layout(dimension, host.activeContainerOffset.quickPickTop);
			}
		}));
		this._register(host.onDidChangeActiveContainer(() => {
			if (controller.isVisible()) {
				return;
			}

			controller.layout(host.activeContainerDimension, host.activeContainerOffset.quickPickTop);
		}));

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

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token: CancellationToken = CancellationToken.None): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
		return this.controller.pick(picks, options, token);
	}

	input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		return this.controller.input(options, token);
	}

	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: boolean } = { useSeparators: false }): IQuickPick<T, { useSeparators: boolean }> {
		return this.controller.createQuickPick(options);
	}

	createInputBox(): IInputBox {
		return this.controller.createInputBox();
	}

	createQuickWidget(): IQuickWidget {
		return this.controller.createQuickWidget();
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

	setAlignment(alignment: 'top' | 'center' | { top: number; left: number }): void {
		this.controller.setAlignment(alignment);
	}

	toggleHover(): void {
		if (this.hasController) {
			this.controller.toggleHover();
		}
	}

	override updateStyles() {
		if (this.hasController) {
			this.controller.applyStyles(this.computeStyles());
		}
	}

	private computeStyles(): IQuickInputStyles {
		return {
			widget: {
				quickInputBackground: asCssVariable(quickInputBackground),
				quickInputForeground: asCssVariable(quickInputForeground),
				quickInputTitleBackground: asCssVariable(quickInputTitleBackground),
				widgetBorder: asCssVariable(widgetBorder),
				widgetShadow: asCssVariable(widgetShadow),
			},
			inputBox: defaultInputBoxStyles,
			toggle: defaultToggleStyles,
			countBadge: defaultCountBadgeStyles,
			button: defaultButtonStyles,
			progressBar: defaultProgressBarStyles,
			keybindingLabel: defaultKeybindingLabelStyles,
			list: getListStyles({
				listBackground: quickInputBackground,
				listFocusBackground: quickInputListFocusBackground,
				listFocusForeground: quickInputListFocusForeground,
				// Look like focused when inactive.
				listInactiveFocusForeground: quickInputListFocusForeground,
				listInactiveSelectionIconForeground: quickInputListFocusIconForeground,
				listInactiveFocusBackground: quickInputListFocusBackground,
				listFocusOutline: activeContrastBorder,
				listInactiveFocusOutline: activeContrastBorder,
			}),
			pickerGroup: {
				pickerGroupBorder: asCssVariable(pickerGroupBorder),
				pickerGroupForeground: asCssVariable(pickerGroupForeground),
			}
		};
	}
}
