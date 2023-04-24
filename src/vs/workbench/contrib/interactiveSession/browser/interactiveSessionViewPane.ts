/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { Memento } from 'vs/workbench/common/memento';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IViewState, InteractiveSessionWidget } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';

export interface IInteractiveSessionViewOptions {
	readonly providerId: string;
}

export const INTERACTIVE_SIDEBAR_PANEL_ID = 'workbench.panel.interactiveSessionSidebar';
export class InteractiveSessionViewPane extends ViewPane {
	static ID = 'workbench.panel.interactiveSession.view';

	private _widget!: InteractiveSessionWidget;
	get widget(): InteractiveSessionWidget { return this._widget; }

	private modelDisposables = this._register(new DisposableStore());
	private memento: Memento;
	private viewState: IViewState;

	constructor(
		private readonly interactiveSessionViewOptions: IInteractiveSessionViewOptions,
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
		@IStorageService private readonly storageService: IStorageService,
		@IInteractiveSessionService private readonly interactiveSessionService: IInteractiveSessionService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		// View state for the ViewPane is currently global per-provider basically, but some other strictly per-model state will require a separate memento.
		this.memento = new Memento('interactive-session-view-' + this.interactiveSessionViewOptions.providerId, this.storageService);
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.USER) as IViewState;
	}

	private updateModel(initial = false): void {
		this.modelDisposables.clear();

		const model = this.interactiveSessionService.startSession(this.interactiveSessionViewOptions.providerId, initial, CancellationToken.None);
		if (!model) {
			throw new Error('Could not start interactive session');
		}

		this._widget.setModel(model, { ...this.viewState });
		this.modelDisposables.add(model.onDidDispose(() => {
			this.updateModel();
		}));
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		const scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService]));

		this._widget = this._register(scopedInstantiationService.createInstance(InteractiveSessionWidget, { viewId: this.id }, () => this.getBackgroundColor(), () => this.getBackgroundColor(), () => editorBackground));
		this._register(this.onDidChangeBodyVisibility(visible => {
			this._widget.setVisible(visible);
		}));
		this._widget.render(parent);

		this.updateModel(true);
	}

	acceptInput(query?: string): void {
		this._widget.acceptInput(query);
	}

	async clear(): Promise<void> {
		if (this.widget.viewModel) {
			this.interactiveSessionService.clearSession(this.widget.viewModel.sessionId);
		}
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
		// Since input history is per-provider, this is handled by a separate service and not the memento here.
		// TODO multiple chat views will overwrite each other
		this._widget.saveState();

		const widgetViewState = this._widget.getViewState();
		this.viewState.inputValue = widgetViewState.inputValue;
		this.memento.saveMemento();

		super.saveState();
	}
}


