/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/auxiliaryBarPart';
import 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { activeContrastBorder, editorBackground, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Extensions as PaneCompositeExtensions } from 'vs/workbench/browser/panecomposite';
import { BasePanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from 'vs/workbench/common/auxiliarybar';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_TITLE_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';

export class AuxiliaryBarPart extends BasePanelPart {
	static readonly activePanelSettingsKey = 'workbench.auxiliarybar.activepanelid';
	static readonly pinnedPanelsKey = 'workbench.auxiliarybar.pinnedPanels';
	static readonly placeholdeViewContainersKey = 'workbench.auxiliarybar.placeholderPanels';

	// Use the side bar dimensions
	override readonly minimumWidth: number = 170;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super(
			Parts.AUXILIARYBAR_PART,
			AuxiliaryBarPart.activePanelSettingsKey,
			AuxiliaryBarPart.pinnedPanelsKey,
			AuxiliaryBarPart.placeholdeViewContainersKey,
			PaneCompositeExtensions.Auxiliary,
			SIDE_BAR_BACKGROUND,
			ViewContainerLocation.AuxiliaryBar,
			ActiveAuxiliaryContext.bindTo(contextKeyService),
			AuxiliaryBarFocusContext.bindTo(contextKeyService),
			notificationService,
			storageService,
			telemetryService,
			contextMenuService,
			layoutService,
			keybindingService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
		);
	}

	override toJSON(): object {
		return {
			type: Parts.AUXILIARYBAR_PART
		};
	}
}

registerThemingParticipant((theme, collector) => {

	// Auxiliary Bar Background: since panels can host editors, we apply a background rule if the panel background
	// color is different from the editor background color. This is a bit of a hack though. The better way
	// would be to have a way to push the background color onto each editor widget itself somehow.
	const auxiliaryBarBackground = theme.getColor(SIDE_BAR_BACKGROUND);
	if (auxiliaryBarBackground && auxiliaryBarBackground !== theme.getColor(editorBackground)) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .content .monaco-editor,
			.monaco-workbench .part.auxiliarybar > .content .monaco-editor .margin,
			.monaco-workbench .part.auxiliarybar > .content .monaco-editor .monaco-editor-background {
				background-color: ${auxiliaryBarBackground};
			}
		`);
	}

	// Title Active
	const titleActive = theme.getColor(SIDE_BAR_TITLE_FOREGROUND);
	const titleActiveBorder = theme.getColor(SIDE_BAR_TITLE_FOREGROUND);
	if (titleActive || titleActiveBorder) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${titleActiveBorder} !important;
			}
		`);
	}

	// Title focus
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${focusBorderColor} !important;
				border-bottom: 1px solid;
			}
			`);
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus {
				outline: none;
			}
			`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item.checked .action-label,
			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label {
				outline-color: ${outline};
				outline-width: 1px;
				outline-style: solid;
				border-bottom: none;
				outline-offset: -2px;
			}

			.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:not(.checked):hover .action-label {
				outline-style: dashed;
			}
		`);
	}

	// const inputBorder = theme.getColor(PANEL_INPUT_BORDER);
	// if (inputBorder) {
	// 	collector.addRule(`
	// 		.monaco-workbench .part.auxiliarybar .monaco-inputbox {
	// 			border-color: ${inputBorder}
	// 		}
	// 	`);
	// }
});
