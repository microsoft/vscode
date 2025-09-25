/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IAccessibleViewInformationService } from '../../../../services/accessibility/common/accessibleViewInformationService.js';
import { IErdosEnvironmentService, IPythonEnvironment, ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID } from '../../common/environmentTypes.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../../base/browser/erdosReactRenderer.js';
import { EnvironmentList } from '../components/environmentList.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

export class PythonEnvironmentsView extends ViewPane implements IReactComponentContainer {
	
	static readonly ID = ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID;
	
	private _erdosReactRenderer!: ErdosReactRenderer;
	private _environments: IPythonEnvironment[] = [];
	private _isLoading: boolean = false;
	
	// IReactComponentContainer implementation
	private readonly _onSizeChangedEmitter = new Emitter<ISize>();
	public readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;
	
	private readonly _onFocusedEmitter = new Emitter<void>();
	public readonly onFocused: Event<void> = this._onFocusedEmitter.event;
	
	private readonly _onVisibilityChangedEmitter = new Emitter<boolean>();
	public readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;
	
	private readonly _onSaveScrollPositionEmitter = new Emitter<void>();
	public readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;
	
	private readonly _onRestoreScrollPositionEmitter = new Emitter<void>();
	public readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;
	
	public get width(): number {
		return this.element.clientWidth;
	}
	
	public get height(): number {
		return this.element.clientHeight;
	}
	
	public get containerVisible(): boolean {
		return this.isBodyVisible();
	}
	
	public takeFocus(): void {
		this.focus();
	}
	
	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IAccessibleViewInformationService accessibleViewService: IAccessibleViewInformationService,
		@IErdosEnvironmentService private readonly environmentService: IErdosEnvironmentService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
		
		
		// Listen for environment changes
		this._register(this.environmentService.onDidChangeEnvironments(() => {
			this.refresh();
		}));

		// Listen for active environment changes
		this._register(this.environmentService.onDidChangeActiveEnvironment((languageId) => {
			if (languageId === 'python') {
				this.refresh();
			}
		}));
	}
	
	public override dispose(): void {
		this._onSizeChangedEmitter.dispose();
		this._onFocusedEmitter.dispose();
		this._onVisibilityChangedEmitter.dispose();
		this._onSaveScrollPositionEmitter.dispose();
		this._onRestoreScrollPositionEmitter.dispose();
		super.dispose();
	}
	
	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
				
		// Create and render the React component
		this._erdosReactRenderer = new ErdosReactRenderer(container);
		this._register(this._erdosReactRenderer);
		
		this.renderReactComponent();
		
		// Initial load
		this.refresh();
	}
	
	private renderReactComponent(): void {
		this._erdosReactRenderer.render(
			React.createElement(EnvironmentList, {
				environments: this._environments,
				isLoading: this._isLoading,
				onSwitchEnvironment: async (environment: IPythonEnvironment) => {
					await this.handleEnvironmentSwitch(environment);
				},
				onRefresh: () => {
					this.refresh();
				},
			})
		);
	}
	
	private async handleEnvironmentSwitch(environment: IPythonEnvironment): Promise<void> {
		await this.environmentService.switchToEnvironment(environment);
	}
	
	public async refresh(): Promise<void> {
		try {
			this._isLoading = true;
			this.renderReactComponent();
			
			// Get fresh data
			const environments = await this.environmentService.getPythonEnvironments();
			this._environments = environments || [];
			this._isLoading = false;

			this.renderReactComponent();

		} catch (error) {
			console.error('[PythonEnvironmentsView] Failed to refresh Python environments:', error);
			this._environments = [];
			this._isLoading = false;
			this.renderReactComponent();
		}
	}
}