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
import { IErdosEnvironmentService, IPythonEnvironment, ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID } from '../../common/environmentTypes.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';

interface IPythonEnvironmentTreeElement {
	readonly element: IPythonEnvironment;
	readonly parent?: IPythonEnvironmentTreeElement;
}

class PythonEnvironmentsDataSource implements IAsyncDataSource<IPythonEnvironment[], IPythonEnvironmentTreeElement> {
	
	constructor(
		@IErdosEnvironmentService private readonly environmentService: IErdosEnvironmentService
	) {
		console.debug('[PythonEnvironmentsDataSource] Constructor');
	}
	
	hasChildren(element: IPythonEnvironment[] | IPythonEnvironmentTreeElement): boolean {
		const hasChildren = Array.isArray(element);
		console.debug(`[PythonEnvironmentsDataSource] hasChildren: ${hasChildren}`);
		return hasChildren;
	}
	
	async getChildren(element: IPythonEnvironment[] | IPythonEnvironmentTreeElement): Promise<IPythonEnvironmentTreeElement[]> {
		console.debug(`[PythonEnvironmentsDataSource] getChildren called with element type: ${Array.isArray(element) ? 'array' : 'tree-element'}`);
		
		if (Array.isArray(element)) {
			// Root level - return all Python environments
			console.debug('[PythonEnvironmentsDataSource] Fetching Python environments from service');
			const environments = await this.environmentService.getPythonEnvironments();
			console.debug(`[PythonEnvironmentsDataSource] Got ${environments.length} environments from service`);
			
			const treeElements = environments.map(env => ({
				element: env,
				parent: undefined
			}));
			
			console.debug(`[PythonEnvironmentsDataSource] Returning ${treeElements.length} tree elements`);
			return treeElements;
		}
		
		// Environment nodes have no children
		console.debug('[PythonEnvironmentsDataSource] Non-array element, returning empty array');
		return [];
	}
}

class PythonEnvironmentTreeVirtualDelegate implements IListVirtualDelegate<IPythonEnvironmentTreeElement> {
	getHeight(element: IPythonEnvironmentTreeElement): number {
		return 44; // Height for environment items with name and details
	}
	
	getTemplateId(element: IPythonEnvironmentTreeElement): string {
		return 'environment';
	}
}

interface IPythonEnvironmentTemplateData {
	container: HTMLElement;
	icon: HTMLElement;
	label: IResourceLabel;
	description: HTMLElement;
	badge: HTMLElement;
}

class PythonEnvironmentTreeRenderer implements ITreeRenderer<IPythonEnvironmentTreeElement, FuzzyScore, IPythonEnvironmentTemplateData> {
	
	static readonly TEMPLATE_ID = 'environment';
	
	get templateId(): string {
		return PythonEnvironmentTreeRenderer.TEMPLATE_ID;
	}
	
	constructor(
		private readonly labels: ResourceLabels
	) {}
	
	renderTemplate(container: HTMLElement): IPythonEnvironmentTemplateData {
		container.classList.add('python-environment-item');
		
		const icon = document.createElement('div');
		icon.className = 'environment-icon';
		container.appendChild(icon);
		
		const labelContainer = document.createElement('div');
		labelContainer.className = 'environment-label-container';
		container.appendChild(labelContainer);
		
		const label = this.labels.create(labelContainer, {
			supportHighlights: true
		});
		
		const description = document.createElement('div');
		description.className = 'environment-description';
		labelContainer.appendChild(description);
		
		const badge = document.createElement('div');
		badge.className = 'environment-badge';
		container.appendChild(badge);
		
		return {
			container,
			icon,
			label,
			description,
			badge
		};
	}
	
	renderElement(element: ITreeNode<IPythonEnvironmentTreeElement, FuzzyScore>, index: number, templateData: IPythonEnvironmentTemplateData): void {
		const env = element.element.element;
		
		// Set icon based on environment type
		templateData.icon.className = `environment-icon ${this.getEnvironmentIconClass(env.type)}`;
		
		// Set label
		templateData.label.setResource({
			resource: undefined,
			name: env.name,
			description: undefined
		}, {
			matches: createMatches(element.filterData)
		});
		
		// Set description
		templateData.description.textContent = `${env.type} - ${env.version}`;
		
		// Set active badge
		if (env.isActive) {
			templateData.badge.textContent = localize('activeEnvironment', 'Active');
			templateData.badge.className = 'environment-badge active';
			templateData.container.classList.add('active');
		} else {
			templateData.badge.textContent = '';
			templateData.badge.className = 'environment-badge';
			templateData.container.classList.remove('active');
		}
		
		// Set path as tooltip
		templateData.container.title = env.path;
	}
	
	disposeTemplate(templateData: IPythonEnvironmentTemplateData): void {
		templateData.label.dispose();
	}
	
	private getEnvironmentIconClass(type: string): string {
		switch (type) {
			case 'conda': return 'codicon codicon-symbol-misc';
			case 'venv': return 'codicon codicon-folder';
			case 'system': return 'codicon codicon-gear';
			case 'pyenv': return 'codicon codicon-versions';
			case 'pipenv': return 'codicon codicon-package';
			default: return 'codicon codicon-folder';
		}
	}
}

class PythonEnvironmentTreeIdentityProvider implements IIdentityProvider<IPythonEnvironmentTreeElement> {
	getId(element: IPythonEnvironmentTreeElement): string {
		return element.element.runtimeId || element.element.path;
	}
}

class PythonEnvironmentTreeAccessibilityProvider implements IListAccessibilityProvider<IPythonEnvironmentTreeElement> {
	getAriaLabel(element: IPythonEnvironmentTreeElement): string {
		const env = element.element;
		return localize('pythonEnvironmentAriaLabel', '{0} {1} environment, version {2}{3}', 
			env.name, env.type, env.version, env.isActive ? ', active' : '');
	}
	
	getWidgetAriaLabel(): string {
		return localize('pythonEnvironmentsAriaLabel', 'Python Environments');
	}
}

export class PythonEnvironmentsView extends ViewPane {
	
	static readonly ID = ERDOS_PYTHON_ENVIRONMENTS_VIEW_ID;
	
	private treeContainer!: HTMLElement;
	private tree!: WorkbenchAsyncDataTree<IPythonEnvironment[], IPythonEnvironmentTreeElement, FuzzyScore>;
	private resourceLabels!: ResourceLabels;
	
	// Debug counters to track infinite loops
	private refreshCallCount = 0;
	private maxRefreshCalls = 100; // Safety limit
	
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
		
		console.debug('[PythonEnvironmentsView] Constructor - registering event listeners');
		
		this._register(this.environmentService.onDidChangeEnvironments(() => {
			console.debug('[PythonEnvironmentsView] onDidChangeEnvironments - triggering refresh');
			this.refresh();
		}));
		
		this._register(this.environmentService.onDidChangeActiveEnvironment(() => {
			console.debug('[PythonEnvironmentsView] onDidChangeActiveEnvironment - triggering refresh');
			this.refresh();
		}));
		
		console.debug('[PythonEnvironmentsView] Constructor complete');
	}
	
	public override dispose(): void {
		this.resourceLabels?.dispose();
		super.dispose();
	}
	
	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		
		this.treeContainer = document.createElement('div');
		this.treeContainer.className = 'python-environments-tree';
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
		
		const delegate = new PythonEnvironmentTreeVirtualDelegate();
		const renderer = new PythonEnvironmentTreeRenderer(this.resourceLabels);
		const dataSource = this.instantiationService.createInstance(PythonEnvironmentsDataSource);
		const identityProvider = new PythonEnvironmentTreeIdentityProvider();
		const accessibilityProvider = new PythonEnvironmentTreeAccessibilityProvider();
		
		this.tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'PythonEnvironments',
			this.treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				identityProvider,
				accessibilityProvider,
				multipleSelectionSupport: false,
				openOnSingleClick: false,
				expandOnlyOnTwistieClick: false,
				overrideStyles: this.getLocationBasedColors().listOverrideStyles
			}
		) as WorkbenchAsyncDataTree<IPythonEnvironment[], IPythonEnvironmentTreeElement, FuzzyScore>;
		
		// Register the tree instance for proper disposal
		this._register(this.tree);
		
		// Set up event handlers
		this._register(this.tree.onDidOpen((e: { element?: IPythonEnvironmentTreeElement }) => {
			if (e.element) {
				this.handleEnvironmentSelection(e.element.element);
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
	
	private handleEnvironmentSelection(environment: IPythonEnvironment): void {
		// Handle environment selection - could switch to this environment
		// For now, just log the selection
		console.log('Selected Python environment:', environment);
	}
	
	public async refresh(): Promise<void> {
		this.refreshCallCount++;
		
		// Get call stack for debugging infinite loops
		const stack = new Error().stack;
		const caller = stack?.split('\n')[2]?.trim() || 'unknown';
		
		console.debug(`[PythonEnvironmentsView] refresh() called #${this.refreshCallCount} from: ${caller}`);
		
		// Safety check for infinite loops
		if (this.refreshCallCount > this.maxRefreshCalls) {
			console.error(`[PythonEnvironmentsView] INFINITE LOOP DETECTED! refresh() called ${this.refreshCallCount} times. Call stack:`, stack);
			return;
		}
		
		if (!this.tree) {
			console.debug('[PythonEnvironmentsView] refresh() - no tree yet, returning');
			return;
		}
		
		try {
			console.debug('[PythonEnvironmentsView] refresh() - getting environments from service');
			// Get fresh data and refresh the tree
			const environments = await this.environmentService.getPythonEnvironments();
			console.debug(`[PythonEnvironmentsView] refresh() - got ${environments.length} environments, setting tree input`);
			
			// Track if setInput triggers more refresh calls
			console.debug('[PythonEnvironmentsView] refresh() - BEFORE tree.setInput()');
			await this.tree.setInput(environments);
			console.debug('[PythonEnvironmentsView] refresh() - AFTER tree.setInput() - completed successfully');
		} catch (error) {
			console.error('[PythonEnvironmentsView] Failed to refresh Python environments:', error);
		}
	}
}
