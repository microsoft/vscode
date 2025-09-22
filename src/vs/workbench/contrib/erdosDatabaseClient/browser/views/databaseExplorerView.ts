/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ViewPane, ViewPaneShowActions } from '../../../../browser/parts/views/viewPane.js';
import { IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ITreeNode } from '../../common/erdosDatabaseClientApi.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource } from '../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ITreeRenderer, ITreeNode as ITreeNodeElement } from '../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConnectionInput } from '../editors/connectionInput.js';
import { IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { FileAccess, type AppResourcePath } from '../../../../../base/common/network.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';

interface IDatabaseTreeElement {
	readonly element: ITreeNode;
}

interface IDatabaseTreeTemplateData {
	readonly container: HTMLElement;
	readonly resourceLabel: IResourceLabel;
	readonly icon: HTMLElement;
}

class DatabaseTreeVirtualDelegate implements IListVirtualDelegate<IDatabaseTreeElement> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return 'database-tree-element';
	}
}

class DatabaseTreeRenderer implements ITreeRenderer<IDatabaseTreeElement, FuzzyScore, IDatabaseTreeTemplateData> {
	templateId = 'database-tree-element';

	constructor(
		private readonly labels: ResourceLabels
	) {}

	renderTemplate(container: HTMLElement): IDatabaseTreeTemplateData {
		
		// Add the same class as VS Code's native tree view
		container.classList.add('custom-view-tree-node-item');
		
		// Create ResourceLabel just like VS Code's native tree renderer
		const resourceLabel = this.labels.create(container, { 
			supportHighlights: true,
			hoverDelegate: undefined // We could add hover support later
		});
		
		// Create icon element and prepend it to the resourceLabel element (like VS Code does)
		const icon = document.createElement('div');
		icon.className = 'custom-view-tree-node-item-icon';
		resourceLabel.element.prepend(icon);
		
		return { container, resourceLabel, icon };
	}

	renderElement(element: ITreeNodeElement<IDatabaseTreeElement, FuzzyScore>, index: number, templateData: IDatabaseTreeTemplateData): void {
		const node = element.element.element;		
		// Use ResourceLabel.setResource just like VS Code's native tree renderer
		const label = node.label;
		const description = node.description;
		const title = node.tooltip || label;
		
		// Set the resource using the same pattern as VS Code's tree renderer
		templateData.resourceLabel.setResource({ 
			name: label, 
			description: description 
		}, {
			title: title,
			hideIcon: true, // We'll handle icons separately
			extraClasses: ['custom-view-tree-node-item-resourceLabel'],
			labelEscapeNewLines: true
		});
		
		// Handle icons like VS Code's tree renderer
		this.renderIcon(node, templateData);
	}

	private renderIcon(node: ITreeNode, templateData: IDatabaseTreeTemplateData): void {
		// Handle SVG icons with background-image (like VS Code's tree renderer)
		if (node.iconPath && (node.iconPath.includes('/') || node.iconPath.includes('\\'))) {
			templateData.icon.className = 'custom-view-tree-node-item-icon';
			// Convert extension resource path to browser URI
			const iconFileName = node.iconPath.split('/').pop() || node.iconPath.split('\\').pop();
			const iconUrl = this.getIconDataUri(iconFileName!);
			templateData.icon.style.backgroundImage = `url('${iconUrl}')`;
			templateData.icon.style.backgroundSize = '16px 16px';
			templateData.icon.style.backgroundRepeat = 'no-repeat';
			templateData.icon.style.backgroundPosition = 'center';
		} else if (node.iconPath) {
			// Handle codicons (like VS Code's tree renderer)
			const iconClass = this.getNodeIconClass(node);
			templateData.icon.className = `custom-view-tree-node-item-icon ${iconClass}`;
			templateData.icon.style.backgroundImage = '';
		} else {
			// Default icon based on node type
			const iconClass = this.getNodeIconClass(node);
			templateData.icon.className = `custom-view-tree-node-item-icon ${iconClass}`;
			templateData.icon.style.backgroundImage = '';
		}
	}

	disposeTemplate(templateData: IDatabaseTreeTemplateData): void {
		templateData.resourceLabel.dispose();
	}

	private getNodeIconClass(node: ITreeNode): string {
		if (node.iconPath) {
			// Check if it's a file path (SVG) or codicon name
			if (node.iconPath.includes('/') || node.iconPath.includes('\\')) {
				// It's a file path - we'll handle this in renderElement with background-image
				return 'database-tree-icon-svg';
			} else {
				// It's a codicon name - check if it already has codicon- prefix
				if (node.iconPath.startsWith('codicon-')) {
					return `codicon ${node.iconPath}`;
				} else {
					return `codicon codicon-${node.iconPath}`;
				}
			}
		}

		// Default icons based on node type
		switch (node.type) {
			case 'connection':
				return 'codicon codicon-database';
			case 'database':
			case 'schema':
				return 'codicon codicon-database';
			case 'table':
				return 'codicon codicon-table';
			case 'view':
				return 'codicon codicon-eye';
			case 'column':
				return 'codicon codicon-symbol-field';
			case 'index':
				return 'codicon codicon-symbol-key';
			case 'procedure':
				return 'codicon codicon-symbol-method';
			case 'function':
				return 'codicon codicon-symbol-function';
			case 'trigger':
				return 'codicon codicon-zap';
			case 'user':
				return 'codicon codicon-person';
			case 'userGroup':
				return 'codicon codicon-organization';
			case 'catalog':
				return 'codicon codicon-folder-opened';
			case 'tableGroup':
				return 'codicon codicon-folder';
			case 'viewGroup':
				return 'codicon codicon-folder';
			default:
				return 'codicon codicon-file';
		}
	}

	private getIconDataUri(iconFileName: string | undefined): string {
		if (!iconFileName) {
			return '';
		}

		// Convert extension resource path to browser URI using the same pattern as ConnectionForm
		const resourcePath = `resources/icon/${iconFileName}`;
		const fullPath = `vs/workbench/contrib/erdosDatabaseClient/media/${resourcePath}` as AppResourcePath;
		const browserUri = FileAccess.asBrowserUri(fullPath);
		
		return browserUri.toString();
	}
}

class DatabaseTreeDataSource implements IAsyncDataSource<ITreeNode, IDatabaseTreeElement> {
	constructor(
		private readonly commandService: ICommandService,
		private readonly telemetryService: ITelemetryService
	) { }

	hasChildren(element: ITreeNode | IDatabaseTreeElement): boolean {
		if ('element' in element) {
			return element.element.collapsibleState !== 0; // VS Code: 0 = None (no children)
		}
		return element.collapsibleState !== 0;
	}

	async getChildren(element: ITreeNode | IDatabaseTreeElement): Promise<IDatabaseTreeElement[]> {
		try {
			let nodeId: string | undefined;
			
			if ('element' in element) {
				nodeId = element.element.id;
			} else if (element) {
				nodeId = element.id;
			}

			const children = await this.commandService.executeCommand<ITreeNode[]>(
				'erdos.getTreeNodes',
				nodeId
			);

			if (!children) {
				return [];
			}

		if (!Array.isArray(children)) {
			return [];
		}

		if (children.length === 0) {
			return [];
		}

		// Filter out null/undefined children to prevent toString errors in tree rendering
		const validChildren = children.filter(child => child != null);
		const result = validChildren.map(child => ({ element: child }));
		return result;
		} catch (error: any) {
			this.telemetryService.publicLog2<{ error: string; nodeId: string }, {
				owner: 'erdos-database-client';
				comment: 'Tree data source error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from tree data source' };
				nodeId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Node ID being retrieved' };
			}>('erdos.treeDataSourceError', {
				error: error.message || 'Unknown error',
				nodeId: ('element' in element) ? element.element.id : (element?.id || 'root')
			});

			return [];
		}
	}
}

class DatabaseTreeIdentityProvider implements IIdentityProvider<IDatabaseTreeElement> {
	getId(element: IDatabaseTreeElement): string {
		return element.element.id;
	}
}

class DatabaseTreeAccessibilityProvider implements IListAccessibilityProvider<IDatabaseTreeElement> {
	getAriaLabel(element: IDatabaseTreeElement): string {
		const node = element.element;
		return `${node.type}: ${node.label}${node.description ? ` (${node.description})` : ''}`;
	}

	getWidgetAriaLabel(): string {
		return localize('databaseExplorer', 'Database Explorer');
	}
}

/**
 * Database Explorer View - creates a native VS Code tree view for database connections.
 * This is the primary interface users see in the "Databases" pane.
 */
export class DatabaseExplorerView extends ViewPane {

	public static readonly ID = 'erdosDatabaseClient.explorer';
	public static readonly TITLE = localize('databaseExplorer.title', 'Database Explorer');

	private _tree?: WorkbenchAsyncDataTree<ITreeNode, IDatabaseTreeElement, FuzzyScore>;
	private _treeContainer?: HTMLElement;
	private _resourceLabels?: ResourceLabels;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService protected override readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super(
			{
				...options,
				showActions: ViewPaneShowActions.Always
			},
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		// Listen for configuration changes to automatically refresh the tree
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('database-client.connections')) {
				this.refresh();
			}
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		this._treeContainer = container;
		this._createTree();
	}

	override dispose(): void {
		this._tree?.dispose();
		this._resourceLabels?.dispose();
		super.dispose();
	}

	private _createTree(): void {
		if (!this._treeContainer) {
			return;
		}

		
		// Create ResourceLabels for proper label rendering (like VS Code's native tree view)
		this._resourceLabels = this.instantiationService.createInstance(ResourceLabels, {
			onDidChangeVisibility: this.onDidChangeBodyVisibility
		});
		
		const delegate = new DatabaseTreeVirtualDelegate();
		const renderer = new DatabaseTreeRenderer(this._resourceLabels);
		const dataSource = new DatabaseTreeDataSource(
			this._commandService,
			this._telemetryService
		);
		const identityProvider = new DatabaseTreeIdentityProvider();
		const accessibilityProvider = new DatabaseTreeAccessibilityProvider();

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'DatabaseExplorer',
			this._treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				identityProvider,
				accessibilityProvider,
				multipleSelectionSupport: false,
				collapseByDefault: (e: unknown) => {
					if (typeof e === 'object' && e !== null && 'element' in e) {
						const element = (e as IDatabaseTreeElement).element;
						return element.collapsibleState !== 2; // VS Code: 2 = Expanded, 1 = Collapsed
					}
					return true;
				},
				openOnSingleClick: false,
				expandOnlyOnTwistieClick: (e: unknown) => {
					if (typeof e === 'object' && e !== null && 'element' in e) {
						const element = (e as IDatabaseTreeElement).element;
						return element.type === 'connection' || element.type === 'database';
					}
					return false;
				}
			}
		) as WorkbenchAsyncDataTree<ITreeNode, IDatabaseTreeElement, FuzzyScore>;

		// Register the tree instance for proper disposal to prevent leaked disposables
		this._register(this._tree);

		// Set up event handlers
		this._tree.onDidOpen((e: { element?: IDatabaseTreeElement }) => {
			if (e.element) {
				this._handleNodeDoubleClick(e.element.element);
			}
		});

		// Set up context menu
		this._tree.onContextMenu((e) => {
			if (e.element) {
				this._handleContextMenu(e.element.element, e.anchor);
			}
		});

		// Load initial data
		this._loadRootNodes();
	}

	private async _loadRootNodes(): Promise<void> {		
		if (!this._tree) {
			console.error('[DatabaseExplorerView] No tree instance available for _loadRootNodes');
			return;
		}

		try {
			// Create a dummy root node to trigger data source - mark as expanded so getChildren is called
			const rootNode: ITreeNode = {
				id: 'root',
				label: 'Root',
				type: 'root',
				collapsibleState: 1
			};

			await this._tree.setInput(rootNode);
						
			// Force a layout update
			this._tree.layout();
		} catch (error: any) {
			console.error('[DatabaseExplorerView] Error loading root nodes:', error);
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Root nodes loading error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from root nodes loading' };
			}>('erdos.loadRootNodesError', {
				error: error.message || 'Unknown error'
			});

		}
	}

	private async _handleNodeDoubleClick(node: ITreeNode): Promise<void> {		
		// Execute the appropriate command based on node type and contextValue
		// These map to the original extension commands that were in node.command
		switch (node.type) {
				case 'table':
					// Cache the node and pass nodeId to command
					const tableNodeId = await this._getNodeFromExtension(node.id);
					if (tableNodeId) {
						await this._commandService.executeCommand('database.table.find', tableNodeId, true);
					}
					break;
				case 'view':
					// Views also use database.table.find for showing data
					const viewNodeId = await this._getNodeFromExtension(node.id);
					if (viewNodeId) {
						await this._commandService.executeCommand('database.table.find', viewNodeId, true);
					}
					break;
				case 'function':
					const functionNodeId = await this._getNodeFromExtension(node.id);
					if (functionNodeId) {
						await this._commandService.executeCommand('database.show.function', functionNodeId, true);
					}
					break;
				case 'procedure':
					const procedureNodeId = await this._getNodeFromExtension(node.id);
					if (procedureNodeId) {
						await this._commandService.executeCommand('database.show.procedure', procedureNodeId, true);
					}
					break;
				case 'trigger':
					const triggerNodeId = await this._getNodeFromExtension(node.id);
					if (triggerNodeId) {
						await this._commandService.executeCommand('database.show.trigger', triggerNodeId, true);
					}
					break;
				case 'user':
					const userNodeId = await this._getNodeFromExtension(node.id);
					if (userNodeId) {
						await this._commandService.executeCommand('database.user.sql', userNodeId, true);
					}
					break;
				case 'column':
					const columnNodeId = await this._getNodeFromExtension(node.id);
					if (columnNodeId) {
						await this._commandService.executeCommand('database.column.update', columnNodeId, true);
					}
					break;
				case 'esIndex':
					const esIndexNodeId = await this._getNodeFromExtension(node.id);
					if (esIndexNodeId) {
						await this._commandService.executeCommand('database.show.esIndex', esIndexNodeId, true);
					}
					break;
				case 'connection':
					// Check if connection is disabled and should be re-enabled
					if (node.description && node.description.includes('closed')) {
						// Connection is disabled, re-enable it instead of opening editor
						await this._commandService.executeCommand('erdos.disableConnection', node.id, false);
						// Refresh the contrib tree to show updated state
						this.refresh();
					} else {
						// Connection is active, open connection editor
						await this._openConnectionEditor(node);
					}
					break;
				/* REDIS FOLDER HANDLING COMMENTED OUT
				case 'redisFolder':
					// Redis folders should expand/collapse if collapsible
					if (this._tree && node.collapsibleState !== 0) {
						const element = { element: node };
						
						try {
							const isCollapsed = this._tree.isCollapsed(element);
							
							if (isCollapsed) {
								await this._tree.expand(element);
							} else {
								this._tree.collapse(element);
							}
						} catch (error) {
							console.error('[DEBUG] DatabaseExplorerView._handleNodeDoubleClick - Error during expand/collapse:', error);
							throw error; // Re-throw to see the actual error
						}
					}
					break;
				END REDIS FOLDER HANDLING COMMENTED OUT */
				/* REDIS KEY HANDLING COMMENTED OUT
				case 'redisKey':
					// Redis keys should show key details
					const redisKeyNodeId = await this._getNodeFromExtension(node.id);
					if (redisKeyNodeId) {
						await this._commandService.executeCommand('database.redis.key.detail', redisKeyNodeId, true);
					}
					break;
				END REDIS KEY HANDLING COMMENTED OUT */
				default:
					// Check if this is a MongoDB table/collection that should be handled as a table
					if (node.contextValue === 'mongoTable' || (node.type === 'table' && node.contextValue)) {
						const mongoTableNodeId = await this._getNodeFromExtension(node.id);
						if (mongoTableNodeId) {
							await this._commandService.executeCommand('database.table.find', mongoTableNodeId, true);
						}
					} else {
						// For other node types (groups, schemas, etc.), expand/collapse if possible
						if (this._tree && node.collapsibleState !== 0) {
							const element = { element: node };
							const isExpanded = this._tree.isCollapsed(element);
							if (isExpanded) {
								await this._tree.expand(element);
							} else {
								this._tree.collapse(element);
							}
						}
					}
					break;
			}
	}

	private async _handleContextMenu(node: ITreeNode, anchor: any): Promise<void> {
		// Get the appropriate actions for this node type
		const actions = await this._getContextMenuActions(node);
		
		if (actions.length > 0) {
			// Show the actual context menu using VS Code's context menu service
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions
					.filter(action => action.command !== '') // Filter out separators
					.map(action => ({
						id: action.command,
						label: action.label,
						enabled: true,
						run: async () => {
							// Convert node objects to proper extension node IDs
							const convertedArgs = await Promise.all(action.args.map(async (arg) => {
								if (arg && typeof arg === 'object' && arg.id) {
									// Get the proper extension node ID
									const extensionNodeId = await this._getNodeFromExtension(arg.id);
									return extensionNodeId;
								}
								return arg;
							}));
							const result = await this._commandService.executeCommand(action.command, ...convertedArgs);
							
							// Refresh the contrib tree after connection state changes
							if (action.command === 'database.connection.disable' || 
								action.command === 'database.connection.delete' ||
								action.command === 'database.connection.open') {
								this.refresh();
							}
							
							return result;
						}
					} as IAction))
			});
		}
	}

	private async _getContextMenuActions(node: ITreeNode): Promise<Array<{label: string, command: string, args: any[]}>> {
		switch (node.type) {
			case 'connection':
				return [
					{ label: 'New Query', command: 'database.query.switch', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Edit Connection', command: 'database.connection.edit', args: [node] },
					{ label: 'Disable Connection', command: 'database.connection.disable', args: [node] },
					{ label: 'Copy Host', command: 'database.host.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Add Database', command: 'database.database.add', args: [node] },
					{ label: 'Server Info', command: 'database.server.info', args: [node] },
					{ label: 'Terminal', command: 'database.connection.terminal', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete Connection', command: 'database.connection.delete', args: [node] }
				];
			case 'database':
			case 'schema':
			case 'catalog':
				return [
					{ label: 'New Query', command: 'database.query.switch', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Create Table', command: 'database.template.table', args: [node] },
					{ label: 'Add Database', command: 'database.database.add', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Export Data', command: 'database.data.export', args: [node] },
					{ label: 'Export Structure', command: 'database.struct.export', args: [node] },
					{ label: 'Generate Documentation', command: 'database.document.generate', args: [node] },
					{ label: 'Import Data', command: 'database.data.import', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Truncate Database', command: 'database.db.truncate', args: [node] },
					{ label: 'Drop Database', command: 'database.db.drop', args: [node] }
				];
			case 'table':
				return [
					{ label: 'Select Rows', command: 'database.table.show', args: [node] },
					{ label: 'Design Table', command: 'database.table.design', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Add Column', command: 'database.column.add', args: [node] },
					{ label: 'Generate SQL', command: 'database.template.sql', args: [node] },
					{ label: 'Show Source', command: 'database.table.source', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Export Data', command: 'database.data.export', args: [node] },
					{ label: 'Export Structure', command: 'database.struct.export', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Truncate Table', command: 'database.table.truncate', args: [node] },
					{ label: 'Drop Table', command: 'database.table.drop', args: [node] }
				];
			case 'view':
				return [
					{ label: 'Select Rows', command: 'database.table.show', args: [node] },
					{ label: 'View Source', command: 'database.view.source', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Export Data', command: 'database.data.export', args: [node] },
					{ label: 'Export Structure', command: 'database.struct.export', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete View', command: 'database.delete.view', args: [node] }
				];
			case 'column':
				return [
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Move Up', command: 'database.column.up', args: [node] },
					{ label: 'Move Down', command: 'database.column.down', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Update Column', command: 'database.column.update', args: [node] },
					{ label: 'Drop Column', command: 'database.column.drop', args: [node] }
				];
			case 'user':
				return [
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Change Password', command: 'database.change.user', args: [node] },
					{ label: 'Grant Permissions', command: 'database.user.grant', args: [node] },
					{ label: 'User SQL Template', command: 'database.user.sql', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete User', command: 'database.delete.user', args: [node] }
				];
			case 'userGroup':
				return [
					{ label: 'Create User', command: 'database.template.user', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] }
				];
			case 'procedure':
				return [
					{ label: 'Run Procedure', command: 'database.show.procedure', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Show Source', command: 'database.show.procedure', args: [node] },
					{ label: 'Delete Procedure', command: 'database.delete.procedure', args: [node] }
				];
			case 'function':
				return [
					{ label: 'Run Function', command: 'database.show.function', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Show Source', command: 'database.show.function', args: [node] },
					{ label: 'Delete Function', command: 'database.delete.function', args: [node] }
				];
			case 'trigger':
				return [
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Show Source', command: 'database.show.trigger', args: [node] },
					{ label: 'Delete Trigger', command: 'database.delete.trigger', args: [node] }
				];
			case 'queryGroup':
				return [
					{ label: 'Add Query', command: 'database.query.add', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] }
				];
			case 'query':
				return [
					{ label: 'Run Query', command: 'database.query.run', args: [node] },
					{ label: 'Open Query', command: 'database.query.open', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Rename Query', command: 'database.query.rename', args: [node] }
				];
			/* REDIS CONTEXT MENU COMMENTED OUT
			case 'redisConnection':
				return [
					{ label: 'New Terminal', command: 'database.connection.terminal', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] },
					{ label: 'Status', command: 'database.redis.connection.status', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Edit Connection', command: 'database.connection.edit', args: [node] },
					{ label: 'Copy Host', command: 'database.host.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete Connection', command: 'database.connection.delete', args: [node] }
				];
			case 'redisKey':
				return [
					{ label: 'View Key Details', command: 'database.redis.key.detail', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete Key', command: 'database.redis.key.del', args: [node] }
				];
			END REDIS CONTEXT MENU COMMENTED OUT */
			case 'esConnection':
				return [
					{ label: 'New Query', command: 'database.query.switch', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Edit Connection', command: 'database.connection.edit', args: [node] },
					{ label: 'Copy Host', command: 'database.host.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete Connection', command: 'database.connection.delete', args: [node] }
				];
			case 'esIndex':
				return [
					{ label: 'Show Index Data', command: 'database.show.esIndex', args: [node] },
					{ label: 'Copy Name', command: 'database.name.copy', args: [node] }
				];
			case 'sshConnection':
				return [
					{ label: 'New Folder', command: 'database.ssh.folder.new', args: [node] },
					{ label: 'New File', command: 'database.ssh.file.new', args: [node] },
					{ label: 'Upload File', command: 'database.ssh.file.upload', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Open Terminal', command: 'database.ssh.terminal.hear', args: [node] },
					{ label: 'Open Folder', command: 'database.ssh.folder.open', args: [node] },
					{ label: 'Forward Port', command: 'database.ssh.forward.port', args: [node] },
					{ label: 'SOCKS Proxy', command: 'database.ssh.socks.port', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Copy Host', command: 'database.ssh.host.copy', args: [node] },
					{ label: 'Copy Path', command: 'database.ssh.path.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Edit Connection', command: 'database.connection.edit', args: [node] },
					{ label: 'Delete Connection', command: 'database.connection.delete', args: [node] }
				];
			case 'ftpConnection':
				return [
					{ label: 'New File', command: 'database.ssh.file.new', args: [node] },
					{ label: 'New Folder', command: 'database.ssh.folder.new', args: [node] },
					{ label: 'Upload File', command: 'database.ssh.file.upload', args: [node] },
					{ label: 'Refresh', command: 'database.refresh', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Edit Connection', command: 'database.connection.edit', args: [node] },
					{ label: 'Copy Host', command: 'database.ssh.host.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete Connection', command: 'database.connection.delete', args: [node] }
				];
			case 'file':
				return [
					{ label: 'Open File', command: 'database.ssh.file.open', args: [node] },
					{ label: 'Download File', command: 'database.ssh.file.download', args: [node] },
					{ label: 'Copy Path', command: 'database.ssh.path.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Delete File', command: 'database.ssh.file.delete', args: [node] }
				];
			case 'folder':
				return [
					{ label: 'New Folder', command: 'database.ssh.folder.new', args: [node] },
					{ label: 'New File', command: 'database.ssh.file.new', args: [node] },
					{ label: 'Upload File', command: 'database.ssh.file.upload', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Open in Terminal', command: 'database.ssh.folder.open', args: [node] },
					{ label: 'Copy Path', command: 'database.ssh.path.copy', args: [node] },
					{ label: '---', command: '', args: [] }, // Separator
					{ label: 'Refresh', command: 'database.refresh', args: [node] }
				];
			case 'tableGroup':
			case 'viewGroup':
			case 'procedureGroup':
			case 'functionGroup':
			case 'triggerGroup':
				return [
					{ label: 'Refresh', command: 'database.refresh', args: [node] }
				];
			default:
				return [
					{ label: 'Refresh', command: 'database.refresh', args: [node] }
				];
		}
	}

	private async _openConnectionEditor(node: ITreeNode): Promise<void> {
		// Get the connection details
		const connection = await this._commandService.executeCommand<IDatabaseConnection>('erdos.getConnection', node.id);
		
		// Create the editor input with a proper file URI
		const input = new ConnectionInput(connection, false, URI.file(`connection-${node.id}.json`));

		// Open the editor
		await this._editorService.openEditor(input, { pinned: true });
	}

	private async _getNodeFromExtension(nodeId: string): Promise<string | null> {
		try {
			const result = await this._commandService.executeCommand('erdos.getNodeById', nodeId);
			// The result should be the nodeId (string) if successful, null if failed
			return result;
		} catch (error) {
			console.error('[DatabaseExplorerView] _getNodeFromExtension - Failed to get node:', nodeId, error);
			return null;
		}
	}

	public refresh(): void {
		this._loadRootNodes();
	}

	public async addNewConnection(): Promise<void> {
		try {
			// Create a new empty connection with unique placeholder ID
			const uniquePlaceholderId = `new-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
			const newConnection: IDatabaseConnection = {
				id: uniquePlaceholderId,
				name: 'New Connection',
				dbType: 'MySQL' as any,
				host: 'localhost',
				port: 3306,
				user: 'root',
				password: ''
			};

			// Create the editor input for a new connection
			const input = new ConnectionInput(newConnection, true, URI.file(`new-connection.json`));

			// Open the editor
			await this._editorService.openEditor(input, { pinned: true });

			// Log telemetry
			this._telemetryService.publicLog2<{}, {
				owner: 'erdos-database-client';
				comment: 'New connection editor opened tracking';
			}>('erdos.newConnectionEditorOpened', {});

		} catch (error: any) {
			console.error('[DatabaseExplorerView] Error in addNewConnection:', error);
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'New connection editor error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from new connection editor' };
			}>('erdos.newConnectionEditorError', {
				error: error.message || 'Unknown error'
			});

			throw error; // Re-throw so the calling action can see the error
		}
	}
}
