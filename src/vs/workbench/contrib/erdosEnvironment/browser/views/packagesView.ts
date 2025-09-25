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
import { IErdosEnvironmentService, IPythonPackage, IRPackage, ERDOS_PYTHON_PACKAGES_VIEW_ID, ERDOS_R_PACKAGES_VIEW_ID } from '../../common/environmentTypes.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../../base/browser/erdosReactRenderer.js';
import { PackageList } from '../components/packageList.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';

type PackageType = 'python' | 'r';
type Package = IPythonPackage | IRPackage;

export class PackagesView extends ViewPane implements IReactComponentContainer {
	
	private _erdosReactRenderer!: ErdosReactRenderer;
	private _packages: Package[] = [];
	private _isLoading: boolean = false;
	private _isRefreshing: boolean = false; // Add refresh guard like R implementation
	
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
		private readonly packageType: PackageType,
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
		@IErdosEnvironmentService private readonly environmentService: IErdosEnvironmentService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
		
		// Listen for package changes
		this._register(this.environmentService.onDidChangePackages((runtimeId) => {
			// Check if this is for the correct runtime type and we're not already refreshing
			const activeRuntime = this.environmentService.getActiveEnvironment(this.packageType);
			if (!this._isRefreshing && (!runtimeId || (activeRuntime && activeRuntime.runtimeId === runtimeId))) {
				this.refresh();
			}
		}));
		
		// Listen for active environment changes
		this._register(this.environmentService.onDidChangeActiveEnvironment((languageId) => {
			if (languageId === this.packageType) {
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
		
		this._erdosReactRenderer = new ErdosReactRenderer(container);
		this._register(this._erdosReactRenderer);
		
		this.refresh();
	}
	
	private renderReactComponent(): void {
		const activeRuntime = this.environmentService.getActiveEnvironment(this.packageType);
		const hasActiveRuntime = !!activeRuntime;
		
		this._erdosReactRenderer.render(
			React.createElement(PackageList, {
				packages: this._packages,
				type: this.packageType,
				isLoading: this._isLoading,
				hasActiveRuntime: hasActiveRuntime,
				onRefresh: () => this.refresh(),
				onUninstall: async (packageName: string) => {
					if (activeRuntime) {
						if (this.packageType === 'python') {
							await this.environmentService.uninstallPythonPackage(packageName, activeRuntime.runtimeId);
						} else {
							await this.environmentService.removeRPackage(packageName, activeRuntime.runtimeId);
						}
					}
				},
				onInstall: () => this.showInstallPackageDialog()
			})
		);
	}

	private async showInstallPackageDialog(): Promise<void> {
		const activeRuntime = this.environmentService.getActiveEnvironment(this.packageType);
		if (!activeRuntime) {
			this.notificationService.warn(`No active ${this.packageType} runtime available`);
			return;
		}

		const packageName = await this.quickInputService.input({
			title: `Install ${this.packageType === 'python' ? 'Python' : 'R'} Package`,
			prompt: `Enter the ${this.packageType} package name to install`,
			placeHolder: this.packageType === 'python' 
				? 'e.g., numpy, pandas, requests, matplotlib'
				: 'e.g., ggplot2, dplyr, tidyr, shiny',
			validateInput: async (value: string) => {
				if (!value.trim()) {
					return 'Package name cannot be empty';
				}
				return undefined;
			}
		});

		if (!packageName?.trim()) {
			return; // User cancelled or entered empty name
		}

		const trimmedPackageName = packageName.trim();

		try {
			this.notificationService.info(`Installing ${this.packageType} package: ${trimmedPackageName}...`);
			
			if (this.packageType === 'python') {
				await this.environmentService.installPythonPackage(trimmedPackageName, activeRuntime.runtimeId);
			} else {
				await this.environmentService.installRPackage(trimmedPackageName, activeRuntime.runtimeId);
			}
			
			this.notificationService.info(`Successfully installed ${this.packageType} package: ${trimmedPackageName}`);
			
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.notificationService.error(`Failed to install ${this.packageType} package ${trimmedPackageName}: ${errorMessage}`);
		}
	}

	public async refresh(): Promise<void> {
		// Prevent infinite loops - same logic as R implementation
		if (this._isRefreshing) {
			return;
		}
		
		this._isRefreshing = true;
		try {
			// Check if we have an active runtime for this package type
			const activeRuntime = this.environmentService.getActiveEnvironment(this.packageType);
			
			if (!activeRuntime) {
				this._packages = [];
				this._isLoading = false;
				this.renderReactComponent();
				return;
			}
			
			this._isLoading = true;
			this.renderReactComponent();
			
			// Force refresh - bypass cache by passing forceRefresh=true
			let packages: Package[];
			if (this.packageType === 'python') {
				packages = await this.environmentService.getPythonPackages(activeRuntime.runtimeId, true);
			} else {
				packages = await this.environmentService.getRPackages(activeRuntime.runtimeId, true);
			}
			
			this._packages = packages || [];
			this._isLoading = false;
			
			this.renderReactComponent();
			
		} catch (error) {
			console.error(`Failed to refresh ${this.packageType} packages:`, error);
			this._packages = [];
			this._isLoading = false;
			this.renderReactComponent();
		} finally {
			this._isRefreshing = false; // Always clear the flag
		}
	}
}

// Specific implementations for each package type
export class PythonPackagesView extends PackagesView {
	static readonly ID = ERDOS_PYTHON_PACKAGES_VIEW_ID;
	
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
		@IErdosEnvironmentService environmentService: IErdosEnvironmentService,
		@IQuickInputService quickInputService: IQuickInputService,
		@INotificationService notificationService: INotificationService
	) {
		super(options, 'python', keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService, environmentService, quickInputService, notificationService);
	}
}

export class RPackagesView extends PackagesView {
	static readonly ID = ERDOS_R_PACKAGES_VIEW_ID;
	
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
		@IErdosEnvironmentService environmentService: IErdosEnvironmentService,
		@IQuickInputService quickInputService: IQuickInputService,
		@INotificationService notificationService: INotificationService
	) {
		super(options, 'r', keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService, environmentService, quickInputService, notificationService);
	}
}
