/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Component } from 'vs/workbench/common/component';
import { IQuickInputService, IQuickPickItem, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickPick, IQuickInputButton, IInputBox, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { inputBackground, inputForeground, inputBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationInfoBorder, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationWarningBorder, inputValidationErrorBackground, inputValidationErrorForeground, inputValidationErrorBorder, badgeBackground, badgeForeground, contrastBorder, buttonForeground, buttonBackground, buttonHoverBackground, progressBarBackground, widgetShadow, listFocusForeground, listFocusBackground, activeContrastBorder, pickerGroupBorder, pickerGroupForeground } from 'vs/platform/theme/common/colorRegistry';
import { QUICK_INPUT_BACKGROUND, QUICK_INPUT_FOREGROUND } from 'vs/workbench/common/theme';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CLOSE_ON_FOCUS_LOST_CONFIG } from 'vs/workbench/browser/quickopen';
import { computeStyles } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandAndKeybindingRule, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { inQuickOpenContext, InQuickOpenContextKey } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { QuickInputController, IQuickInputStyles } from 'vs/base/parts/quickinput/browser/quickInput';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { List, IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';

export class QuickInputService extends Component implements IQuickInputService {

	public _serviceBrand: undefined;

	public backButton: IQuickInputButton;

	private static readonly ID = 'workbench.component.quickinput';


	private inQuickOpenWidgets: Record<string, boolean> = {};
	private inQuickOpenContext: IContextKey<boolean>;
	private contexts: Map<string, IContextKey<boolean>> = new Map();
	private controller: QuickInputController;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(QuickInputService.ID, themeService, storageService);
		this.inQuickOpenContext = InQuickOpenContextKey.bindTo(contextKeyService);
		this._register(this.quickOpenService.onShow(() => this.inQuickOpen('quickOpen', true)));
		this._register(this.quickOpenService.onHide(() => this.inQuickOpen('quickOpen', false)));
		this.controller = new QuickInputController({
			idPrefix: 'quickInput_', // Constant since there is still only one.
			container: this.layoutService.getWorkbenchElement(),
			ignoreFocusOut: () => this.environmentService.args['sticky-quickopen'] || !this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG),
			isScreenReaderOptimized: () => this.accessibilityService.isScreenReaderOptimized(),
			backKeybindingLabel: () => this.keybindingService.lookupKeybinding(QuickPickBack.id)?.getLabel() || undefined,
			setContextKey: (id?: string) => this.setContextKey(id),
			returnFocus: () => this.editorGroupService.activeGroup.focus(),
			createList: <T>(
				user: string,
				container: HTMLElement,
				delegate: IListVirtualDelegate<T>,
				renderers: IListRenderer<T, any>[],
				options: IListOptions<T>,
			) => this.instantiationService.createInstance(WorkbenchList, user, container, delegate, renderers, options) as List<T>,
			styles: this.computeStyles(),
		});
		this.backButton = this.controller.backButton;
		this._register(this.layoutService.onLayout(dimension => this.controller.layout(dimension, this.layoutService.getTitleBarOffset())));
		this.controller.layout(this.layoutService.dimension, this.layoutService.getTitleBarOffset());
		this._register(this.quickOpenService.onShow(() => this.controller.hide(true)));
		this._register(this.controller.onShow(() => {
			this.quickOpenService.close();
			this.inQuickOpen('quickInput', true);
			this.resetContextKeys();
		}));
		this._register(this.controller.onHide(() => {
			this.inQuickOpen('quickInput', false);
			this.resetContextKeys();
		}));
	}

	private inQuickOpen(widget: 'quickInput' | 'quickOpen', open: boolean) {
		if (open) {
			this.inQuickOpenWidgets[widget] = true;
		} else {
			delete this.inQuickOpenWidgets[widget];
		}
		if (Object.keys(this.inQuickOpenWidgets).length) {
			if (!this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.set(true);
			}
		} else {
			if (this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.reset();
			}
		}
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

	protected updateStyles() {
		this.controller.applyStyles(this.computeStyles());
	}

	private computeStyles(): IQuickInputStyles {
		return {
			widget: {
				titleColor: { dark: 'rgba(255, 255, 255, 0.105)', light: 'rgba(0,0,0,.06)', hc: 'black' }[this.theme.type], // TODO
				...computeStyles(this.theme, {
					quickInputBackground: QUICK_INPUT_BACKGROUND,
					quickInputForeground: QUICK_INPUT_FOREGROUND,
					contrastBorder,
					widgetShadow,
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
				inputValidationErrorBorder,
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
				listBackground: QUICK_INPUT_BACKGROUND,
				// Look like focused when inactive.
				listInactiveFocusForeground: listFocusForeground,
				listInactiveFocusBackground: listFocusBackground,
				listFocusOutline: activeContrastBorder,
				listInactiveFocusOutline: activeContrastBorder,
				pickerGroupBorder,
				pickerGroupForeground,
			}),
		};
	}
}

export const QuickPickManyToggle: ICommandAndKeybindingRule = {
	id: 'workbench.action.quickPickManyToggle',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.toggle();
	}
};

export const QuickPickBack: ICommandAndKeybindingRule = {
	id: 'workbench.action.quickInputBack',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	when: inQuickOpenContext,
	primary: 0,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS },
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.back();
	}
};

registerSingleton(IQuickInputService, QuickInputService, true);
