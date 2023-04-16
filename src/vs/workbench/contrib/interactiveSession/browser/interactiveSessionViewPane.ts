/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';

export interface IInteractiveSessionViewOptions {
	readonly providerId: string;
}

export const INTERACTIVE_SIDEBAR_PANEL_ID = 'workbench.panel.interactiveSessionSidebar';
export class InteractiveSessionViewPane extends ViewPane {
	static ID = 'workbench.panel.interactiveSession.view';

	private _widget: InteractiveSessionWidget;
	get widget(): InteractiveSessionWidget { return this._widget; }

	constructor(
		interactiveSessionViewOptions: IInteractiveSessionViewOptions,
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));
		this._widget = this._register(scopedInstantiationService.createInstance(InteractiveSessionWidget, interactiveSessionViewOptions.providerId, undefined, { viewId: this.id }, () => this.getBackgroundColor(), () => this.getBackgroundColor(), () => editorBackground));

		this._register(this.onDidChangeBodyVisibility(visible => {
			this._widget.setVisible(visible);
		}));
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		this._widget.render(parent);
	}

	acceptInput(query?: string): void {
		this._widget.acceptInput(query);
	}

	async clear(): Promise<void> {
		await this._widget.clear();
	}

	focusInput(): void {
		this._widget.focusInput();
	}

	override focus(): void {
		super.focus();
		this._widget.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this._widget.layout(height, width);
	}

	override saveState(): void {
		this._widget.saveState();
		super.saveState();
	}
}


