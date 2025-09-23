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
import { IErdosEnvironmentService, IPythonPackage, ERDOS_PYTHON_PACKAGES_VIEW_ID } from '../../common/environmentTypes.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';

interface IPythonPackageTreeElement {
	readonly element: IPythonPackage;
	readonly parent?: IPythonPackageTreeElement;
}

class PythonPackagesDataSource implements IAsyncDataSource<IPythonPackage[], IPythonPackageTreeElement> {
	
	constructor(
		@IErdosEnvironmentService private readonly environmentService: IErdosEnvironmentService
	) {}
	
	hasChildren(element: IPythonPackage[] | IPythonPackageTreeElement): boolean {
		return Array.isArray(element);
	}
	
	async getChildren(element: IPythonPackage[] | IPythonPackageTreeElement): Promise<IPythonPackageTreeElement[]> {
		if (Array.isArray(element)) {
			// Root level - return all Python packages
			const packages = await this.environmentService.getPythonPackages();
			return packages.map(pkg => ({
				element: pkg,
				parent: undefined
			}));
		}
		
		// Package nodes have no children
		return [];
	}
}

class PythonPackageTreeVirtualDelegate implements IListVirtualDelegate<IPythonPackageTreeElement> {
	getHeight(element: IPythonPackageTreeElement): number {
		const hasDescription = element.element.description;
		const hasLocation = element.element.location;
		
		if (hasDescription && hasLocation) {
			return 76; // Name + version + description + location
		} else if (hasDescription || hasLocation) {
			return 60; // Name + version + one extra line
		} else {
			return 44; // Just name + version
		}
	}
	
	getTemplateId(element: IPythonPackageTreeElement): string {
		return 'package';
	}
}

interface IPythonPackageTemplateData {
	container: HTMLElement;
	icon: HTMLElement;
	label: IResourceLabel;
	version: HTMLElement;
	description: HTMLElement;
	location: HTMLElement;
	statusBadge: HTMLElement;
}

class PythonPackageTreeRenderer implements ITreeRenderer<IPythonPackageTreeElement, FuzzyScore, IPythonPackageTemplateData> {
	
	static readonly TEMPLATE_ID = 'package';
	
	get templateId(): string {
		return PythonPackageTreeRenderer.TEMPLATE_ID;
	}
	
	constructor(
		private readonly labels: ResourceLabels
	) {}
	
	renderTemplate(container: HTMLElement): IPythonPackageTemplateData {
		container.classList.add('python-package-item');
		
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
		
		const statusBadge = document.createElement('div');
		statusBadge.className = 'package-status-badge';
		headerContainer.appendChild(statusBadge);
		
		const description = document.createElement('div');
		description.className = 'package-description';
		contentContainer.appendChild(description);
		
		const location = document.createElement('div');
		location.className = 'package-location';
		contentContainer.appendChild(location);
		
		return {
			container,
			icon,
			label,
			version,
			description,
			location,
			statusBadge
		};
	}
	
	renderElement(element: ITreeNode<IPythonPackageTreeElement, FuzzyScore>, index: number, templateData: IPythonPackageTemplateData): void {
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
		
		// Set location
		if (pkg.location) {
			templateData.location.textContent = pkg.location;
			templateData.location.style.display = 'block';
		} else {
			templateData.location.style.display = 'none';
		}
		
		// Set status badge for editable packages
		if (pkg.editable) {
			templateData.statusBadge.textContent = localize('editablePackage', 'Editable');
			templateData.statusBadge.className = 'package-status-badge editable';
			templateData.container.classList.add('editable');
		} else {
			templateData.statusBadge.textContent = '';
			templateData.statusBadge.className = 'package-status-badge';
			templateData.container.classList.remove('editable');
		}
		
		// Set package name as tooltip
		templateData.container.title = pkg.name;
	}
	
	disposeTemplate(templateData: IPythonPackageTemplateData): void {
		templateData.label.dispose();
	}
}

class PythonPackageTreeIdentityProvider implements IIdentityProvider<IPythonPackageTreeElement> {
	getId(element: IPythonPackageTreeElement): string {
		return element.element.name;
	}
}

class PythonPackageTreeAccessibilityProvider implements IListAccessibilityProvider<IPythonPackageTreeElement> {
	getAriaLabel(element: IPythonPackageTreeElement): string {
		const pkg = element.element;
		return localize('pythonPackageAriaLabel', '{0} version {1}{2}{3}', 
			pkg.name, 
			pkg.version, 
			pkg.editable ? ', editable' : '', 
			pkg.description ? `, ${pkg.description}` : '');
	}
	
	getWidgetAriaLabel(): string {
		return localize('pythonPackagesAriaLabel', 'Python Packages');
	}
}

export class PythonPackagesView extends ViewPane {
	
	static readonly ID = ERDOS_PYTHON_PACKAGES_VIEW_ID;
	
	private treeContainer!: HTMLElement;
	private emptyStateContainer!: HTMLElement;
	private tree!: WorkbenchAsyncDataTree<IPythonPackage[], IPythonPackageTreeElement, FuzzyScore>;
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
			// Check if this is for a Python runtime
			const activeRuntime = this.environmentService.getActiveEnvironment('python');
			if (!runtimeId || (activeRuntime && activeRuntime.runtimeId === runtimeId)) {
				this.refresh();
			}
		}));
		
		this._register(this.environmentService.onDidChangeActiveEnvironment((languageId) => {
			if (languageId === 'python') {
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
		title.textContent = localize('noPythonRuntime', 'No Active Python Runtime');
		
		const description = document.createElement('div');
		description.className = 'empty-state-description';
		description.textContent = localize('noPythonRuntimeDescription', 'Start a Python session to view installed packages');
		
		emptyState.appendChild(icon);
		emptyState.appendChild(title);
		emptyState.appendChild(description);
		this.emptyStateContainer.appendChild(emptyState);
		container.appendChild(this.emptyStateContainer);
		
		// Create tree container
		this.treeContainer = document.createElement('div');
		this.treeContainer.className = 'python-packages-tree';
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
		
		const delegate = new PythonPackageTreeVirtualDelegate();
		const renderer = new PythonPackageTreeRenderer(this.resourceLabels);
		const dataSource = this.instantiationService.createInstance(PythonPackagesDataSource);
		const identityProvider = new PythonPackageTreeIdentityProvider();
		const accessibilityProvider = new PythonPackageTreeAccessibilityProvider();
		
		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'PythonPackages',
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
		) as WorkbenchAsyncDataTree<IPythonPackage[], IPythonPackageTreeElement, FuzzyScore>;
		
		// Register the tree instance for proper disposal
		this._register(this.tree);
		
		// Set up event handlers
		this._register(this.tree.onDidOpen((e: { element?: IPythonPackageTreeElement }) => {
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
	
	private handlePackageSelection(pkg: IPythonPackage): void {
		// Handle package selection - could show package details or install/uninstall
		console.log('Selected Python package:', pkg);
	}
	
	public async refresh(): Promise<void> {
		if (!this.tree) {
			return;
		}
		
		try {
			// Check if we have an active Python runtime
			const activeRuntime = this.environmentService.getActiveEnvironment('python');
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
			const packages = await this.environmentService.getPythonPackages();
			await this.tree.setInput(packages);
		} catch (error) {
			console.error('Failed to refresh Python packages:', error);
			// Show empty state on error
			this.emptyStateContainer.style.display = 'flex';
			this.treeContainer.style.display = 'none';
		}
	}
}
