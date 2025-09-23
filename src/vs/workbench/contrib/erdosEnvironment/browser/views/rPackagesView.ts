/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
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
import { IErdosEnvironmentService, IRPackage, ERDOS_R_PACKAGES_VIEW_ID } from '../../common/environmentTypes.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';

interface IRPackageTreeElement {
	readonly element: IRPackage;
	readonly parent?: IRPackageTreeElement;
}

class RPackagesDataSource implements IAsyncDataSource<IRPackage[], IRPackageTreeElement> {
	
	constructor(
		@IErdosEnvironmentService private readonly environmentService: IErdosEnvironmentService
	) {}
	
	hasChildren(element: IRPackage[] | IRPackageTreeElement): boolean {
		return Array.isArray(element);
	}
	
	async getChildren(element: IRPackage[] | IRPackageTreeElement): Promise<IRPackageTreeElement[]> {
		if (Array.isArray(element)) {
			// Root level - return all R packages
			const packages = await this.environmentService.getRPackages();
			return packages.map(pkg => ({
				element: pkg,
				parent: undefined
			}));
		}
		
		// Package nodes have no children
		return [];
	}
}

class RPackageTreeVirtualDelegate implements IListVirtualDelegate<IRPackageTreeElement> {
	getHeight(element: IRPackageTreeElement): number {
		return element.element.description ? 60 : 44; // Extra height if description exists
	}
	
	getTemplateId(element: IRPackageTreeElement): string {
		return 'package';
	}
}

interface IRPackageTemplateData {
	container: HTMLElement;
	icon: HTMLElement;
	label: IResourceLabel;
	version: HTMLElement;
	description: HTMLElement;
	priority: HTMLElement;
	statusBadge: HTMLElement;
}

class RPackageTreeRenderer implements ITreeRenderer<IRPackageTreeElement, FuzzyScore, IRPackageTemplateData> {
	
	static readonly TEMPLATE_ID = 'package';
	
	get templateId(): string {
		return RPackageTreeRenderer.TEMPLATE_ID;
	}
	
	constructor(
		private readonly labels: ResourceLabels
	) {}
	
	renderTemplate(container: HTMLElement): IRPackageTemplateData {
		container.classList.add('r-package-item');
		
		const icon = document.createElement('div');
		icon.className = 'package-icon codicon codicon-package';
		container.appendChild(icon);
		
		const contentContainer = document.createElement('div');
		contentContainer.className = 'package-content';
		container.appendChild(contentContainer);
		
		const headerContainer = document.createElement('div');
		headerContainer.className = 'package-header';
		contentContainer.appendChild(headerContainer);
		
		const labelContainer = document.createElement('div');
		labelContainer.className = 'package-label-container';
		headerContainer.appendChild(labelContainer);
		
		const label = this.labels.create(labelContainer, {
			supportHighlights: true
		});
		
		const version = document.createElement('div');
		version.className = 'package-version';
		headerContainer.appendChild(version);
		
		const priority = document.createElement('div');
		priority.className = 'package-priority';
		headerContainer.appendChild(priority);
		
		const statusBadge = document.createElement('div');
		statusBadge.className = 'package-status-badge';
		headerContainer.appendChild(statusBadge);
		
		const description = document.createElement('div');
		description.className = 'package-description';
		contentContainer.appendChild(description);
		
		return {
			container,
			icon,
			label,
			version,
			description,
			priority,
			statusBadge
		};
	}
	
	renderElement(element: ITreeNode<IRPackageTreeElement, FuzzyScore>, index: number, templateData: IRPackageTemplateData): void {
		const pkg = element.element.element;
		
		// Set label
		templateData.label.setResource({
			resource: undefined,
			name: pkg.name,
			description: undefined
		}, {
			matches: createMatches(element.filterData)
		});
		
		// Set version
		templateData.version.textContent = `v${pkg.version}`;
		
		// Set description
		if (pkg.description) {
			templateData.description.textContent = pkg.description;
			templateData.description.style.display = 'block';
		} else {
			templateData.description.style.display = 'none';
		}
		
		// Set priority
		if (pkg.priority) {
			templateData.priority.textContent = pkg.priority;
			templateData.priority.style.display = 'block';
		} else {
			templateData.priority.style.display = 'none';
		}
		
		// Set status badge
		if (pkg.isLoaded) {
			templateData.statusBadge.textContent = localize('loadedPackage', 'Loaded');
			templateData.statusBadge.className = 'package-status-badge loaded';
			templateData.container.classList.add('loaded');
		} else {
			templateData.statusBadge.textContent = '';
			templateData.statusBadge.className = 'package-status-badge';
			templateData.container.classList.remove('loaded');
		}
		
		// Set dependencies as tooltip
		if (pkg.depends && pkg.depends.length > 0) {
			templateData.container.title = `Dependencies: ${pkg.depends.join(', ')}`;
		} else {
			templateData.container.title = pkg.name;
		}
	}
	
	disposeTemplate(templateData: IRPackageTemplateData): void {
		templateData.label.dispose();
	}
}

class RPackageTreeIdentityProvider implements IIdentityProvider<IRPackageTreeElement> {
	getId(element: IRPackageTreeElement): string {
		return element.element.name;
	}
}

class RPackageTreeAccessibilityProvider implements IListAccessibilityProvider<IRPackageTreeElement> {
	getAriaLabel(element: IRPackageTreeElement): string {
		const pkg = element.element;
		return localize('rPackageAriaLabel', '{0} version {1}{2}{3}', 
			pkg.name, 
			pkg.version, 
			pkg.isLoaded ? ', loaded' : '', 
			pkg.description ? `, ${pkg.description}` : '');
	}
	
	getWidgetAriaLabel(): string {
		return localize('rPackagesAriaLabel', 'R Packages');
	}
}

export class RPackagesView extends ViewPane {
	
	static readonly ID = ERDOS_R_PACKAGES_VIEW_ID;
	
	private treeContainer!: HTMLElement;
	private emptyStateContainer!: HTMLElement;
	private tree!: WorkbenchAsyncDataTree<IRPackage[], IRPackageTreeElement, FuzzyScore>;
	private resourceLabels!: ResourceLabels;
	
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
		
		this._register(this.environmentService.onDidChangePackages((runtimeId) => {
			// Check if this is for an R runtime
			const activeRuntime = this.environmentService.getActiveEnvironment('r');
			if (!runtimeId || (activeRuntime && activeRuntime.runtimeId === runtimeId)) {
				this.refresh();
			}
		}));
		
		this._register(this.environmentService.onDidChangeActiveEnvironment((languageId) => {
			if (languageId === 'r') {
				this.refresh();
			}
		}));
	}
	
	public override dispose(): void {
		this.resourceLabels?.dispose();
		super.dispose();
	}
	
	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		
		// Create empty state container using safe DOM methods
		this.emptyStateContainer = document.createElement('div');
		this.emptyStateContainer.className = 'empty-state-container';
		
		const emptyState = document.createElement('div');
		emptyState.className = 'empty-state';
		
		const icon = document.createElement('div');
		icon.className = 'empty-state-icon codicon codicon-package';
		
		const title = document.createElement('div');
		title.className = 'empty-state-title';
		title.textContent = localize('noRRuntime', 'No Active R Runtime');
		
		const description = document.createElement('div');
		description.className = 'empty-state-description';
		description.textContent = localize('noRRuntimeDescription', 'Start an R session to view installed packages');
		
		emptyState.appendChild(icon);
		emptyState.appendChild(title);
		emptyState.appendChild(description);
		this.emptyStateContainer.appendChild(emptyState);
		container.appendChild(this.emptyStateContainer);
		
		// Create tree container
		this.treeContainer = document.createElement('div');
		this.treeContainer.className = 'r-packages-tree';
		container.appendChild(this.treeContainer);
		
		this.createTree();
	}
	
	private createTree(): void {
		if (!this.treeContainer) {
			return;
		}
		
		// Create ResourceLabels for proper label rendering
		this.resourceLabels = this.instantiationService.createInstance(ResourceLabels, {
			onDidChangeVisibility: this.onDidChangeBodyVisibility
		});
		
		const delegate = new RPackageTreeVirtualDelegate();
		const renderer = new RPackageTreeRenderer(this.resourceLabels);
		const dataSource = this.instantiationService.createInstance(RPackagesDataSource);
		const identityProvider = new RPackageTreeIdentityProvider();
		const accessibilityProvider = new RPackageTreeAccessibilityProvider();
		
		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'RPackages',
			this.treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				identityProvider,
				accessibilityProvider,
				multipleSelectionSupport: true,
				openOnSingleClick: false,
				expandOnlyOnTwistieClick: false,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		) as WorkbenchAsyncDataTree<IRPackage[], IRPackageTreeElement, FuzzyScore>;
		
		// Register the tree instance for proper disposal
		this._register(this.tree);
		
		// Set up event handlers
		this._register(this.tree.onDidOpen((e: { element?: IRPackageTreeElement }) => {
			if (e.element) {
				this.handlePackageSelection(e.element.element);
			}
		}));
		
		// Set up context menu
		this._register(this.tree.onContextMenu((e) => {
			if (e.element) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => e.anchor,
					getActions: () => [],
					getActionsContext: () => e.element?.element
				});
			}
		}));
		
		// Initial load
		this.refresh();
	}
	
	private handlePackageSelection(pkg: IRPackage): void {
		// Handle package selection - could show package details or load/unload
		console.log('Selected R package:', pkg);
	}
	
	public async refresh(): Promise<void> {
		if (!this.tree) {
			return;
		}
		
		try {
			// Check if we have an active R runtime
			const activeRuntime = this.environmentService.getActiveEnvironment('r');
			if (!activeRuntime) {
				// Show empty state
				this.emptyStateContainer.style.display = 'flex';
				this.treeContainer.style.display = 'none';
				return;
			}
			
			// Hide empty state and show tree
			this.emptyStateContainer.style.display = 'none';
			this.treeContainer.style.display = 'block';
			
			// Get fresh data and refresh the tree
			const packages = await this.environmentService.getRPackages();
			await this.tree.setInput(packages);
		} catch (error) {
			console.error('Failed to refresh R packages:', error);
			// Show empty state on error
			this.emptyStateContainer.style.display = 'flex';
			this.treeContainer.style.display = 'none';
		}
	}
}
