/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/auxiliaryBarPart';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { activeContrastBorder, contrastBorder, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Extensions as PaneCompositeExtensions } from 'vs/workbench/browser/panecomposite';
import { BasePanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from 'vs/workbench/common/contextkeys';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_FOREGROUND, SIDE_BAR_TITLE_FOREGROUND } from 'vs/workbench/common/theme';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IActivityHoverOptions } from 'vs/workbench/browser/parts/compositeBarActions';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IAction, Separator, toAction } from 'vs/base/common/actions';
import { ToggleAuxiliaryBarAction } from 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions';
import { assertIsDefined } from 'vs/base/common/types';
import { LayoutPriority } from 'vs/base/browser/ui/splitview/splitview';
import { ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class AuxiliaryBarPart extends BasePanelPart {
	static readonly activePanelSettingsKey = 'workbench.auxiliarybar.activepanelid';
	static readonly pinnedPanelsKey = 'workbench.auxiliarybar.pinnedPanels';
	static readonly placeholdeViewContainersKey = 'workbench.auxiliarybar.placeholderPanels';

	// Use the side bar dimensions
	override readonly minimumWidth: number = 170;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	readonly priority: LayoutPriority = LayoutPriority.Low;

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
		@ICommandService private commandService: ICommandService,
	) {
		super(
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
			Parts.AUXILIARYBAR_PART,
			AuxiliaryBarPart.activePanelSettingsKey,
			AuxiliaryBarPart.pinnedPanelsKey,
			AuxiliaryBarPart.placeholdeViewContainersKey,
			PaneCompositeExtensions.Auxiliary,
			SIDE_BAR_BACKGROUND,
			ViewContainerLocation.AuxiliaryBar,
			ActiveAuxiliaryContext.bindTo(contextKeyService),
			AuxiliaryBarFocusContext.bindTo(contextKeyService),
			{
				useIcons: true,
				hasTitle: true,
				borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0,
			}
		);
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.layoutService.getSideBarPosition() === Position.RIGHT;

		container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

		container.style.borderLeftColor = borderColor ?? '';
		container.style.borderRightColor = borderColor ?? '';

		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : 'none';
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : 'none';

		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '0px';
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '0px';
	}

	protected getActivityHoverOptions(): IActivityHoverOptions {
		return {
			position: () => HoverPosition.BELOW
		};
	}

	protected fillExtraContextMenuActions(actions: IAction[]): void {
		const currentPositionRight = this.layoutService.getSideBarPosition() === Position.LEFT;
		actions.push(...[
			new Separator(),
			toAction({ id: ToggleSidebarPositionAction.ID, label: currentPositionRight ? localize('move second side bar left', "Move Secondary Side Bar Left") : localize('move second side bar right', "Move Secondary Side Bar Right"), run: () => this.commandService.executeCommand(ToggleSidebarPositionAction.ID) }),
			toAction({ id: ToggleAuxiliaryBarAction.ID, label: localize('hide second side bar', "Hide Secondary Side Bar"), run: () => this.commandService.executeCommand(ToggleAuxiliaryBarAction.ID) })
		]);
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
	if (titleActive) {
		collector.addRule(`
		.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label {
			color: ${titleActive} !important;
		}
		`);
		collector.addRule(`
		.monaco-workbench .part.auxiliarybar > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus .action-label {
			color: ${titleActive} !important;
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
