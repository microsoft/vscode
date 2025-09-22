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
import { IHistoryItem } from '../../common/erdosDatabaseClientApi.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource } from '../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { ITreeRenderer, ITreeNode as ITreeNodeElement } from '../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../../nls.js';
import { QueryResultsInput } from '../editors/queryResultsInput.js';
import { IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';
import { ResourceLabels, IResourceLabel } from '../../../../browser/labels.js';

interface IQueryHistoryTreeElement {
	readonly element: IHistoryItem;
}

interface IQueryHistoryTemplateData {
	readonly container: HTMLElement;
	readonly resourceLabel: IResourceLabel;
	readonly icon: HTMLElement;
	readonly meta: HTMLElement;
	readonly time: HTMLElement;
	readonly duration: HTMLElement;
}

class QueryHistoryVirtualDelegate implements IListVirtualDelegate<IQueryHistoryTreeElement> {
	getHeight(): number {
		return 22; // Same height as database tree
	}

	getTemplateId(): string {
		return 'query-history-element';
	}
}

class QueryHistoryRenderer implements ITreeRenderer<IQueryHistoryTreeElement, FuzzyScore, IQueryHistoryTemplateData> {
	templateId = 'query-history-element';

	constructor(
		private readonly labels: ResourceLabels
	) {}

	renderTemplate(container: HTMLElement): IQueryHistoryTemplateData {		
		// Add the same class as VS Code's native tree view but remove indentation
		container.classList.add('custom-view-tree-node-item');
		// Override any tree indentation styles
		container.style.paddingLeft = '0';
		container.style.marginLeft = '0';
		container.style.textIndent = '0';
		
		// Create ResourceLabel just like VS Code's native tree renderer
		const resourceLabel = this.labels.create(container, { 
			supportHighlights: true,
			hoverDelegate: undefined // Match database explorer exactly
		});
		
		// Create icon element and prepend it to the resourceLabel element (like VS Code does)
		const icon = document.createElement('div');
		icon.className = 'custom-view-tree-node-item-icon';
		resourceLabel.element.prepend(icon);
		
		// Create meta information container (minimal for now)
		const meta = document.createElement('div');
		meta.className = 'query-history-meta';
		meta.style.display = 'none'; // Hide meta for now to match database tree simplicity
		
		const time = document.createElement('span');
		time.className = 'query-history-time';
		
		const duration = document.createElement('span');
		duration.className = 'query-history-duration';
		
		meta.appendChild(time);
		meta.appendChild(duration);
		
		// Append meta after the resource label
		resourceLabel.element.appendChild(meta);
		
		const templateData = { container, resourceLabel, icon, meta, time, duration };
		return templateData;
	}

	renderElement(element: ITreeNodeElement<IQueryHistoryTreeElement, FuzzyScore>, index: number, templateData: IQueryHistoryTemplateData): void {		
		const historyItem = element.element.element;
		
		// Format: [Time]: [SQL command] ([ms], [database])
		const timestamp = this.formatTimestamp(historyItem.timestamp);
		const truncatedSQL = this.truncateSQL(historyItem.sql, 60);
		
		let displayText = `${timestamp}: ${truncatedSQL}`;
		
		// Add parenthetical info: (execution time, database)
		const parentheticalParts = [];
		if (historyItem.executionTime) {
			parentheticalParts.push(this.formatExecutionTime(historyItem.executionTime));
		}
		
		let databasePart = historyItem.connectionName;
		if (historyItem.database) {
			databasePart += `/${historyItem.database}`;
		}
		parentheticalParts.push(databasePart);
		
		if (parentheticalParts.length > 0) {
			displayText += ` (${parentheticalParts.join(', ')})`;
		}
		
		// Set the resource using the same pattern as VS Code's tree renderer
		templateData.resourceLabel.setResource({ 
			name: displayText, 
			description: undefined // No description - everything in main text
		}, {
			title: historyItem.sql, // Full SQL on hover
			hideIcon: true, // We'll handle icons separately
			extraClasses: ['custom-view-tree-node-item-resourceLabel'],
			labelEscapeNewLines: true
		});
				
		// Set timestamp
		templateData.time.textContent = this.formatTimestamp(historyItem.timestamp);		
		// Set execution time (no clock icon)
		if (historyItem.executionTime) {
			templateData.duration.textContent = this.formatExecutionTime(historyItem.executionTime);
			templateData.duration.style.display = 'inline';
		} else {
			templateData.duration.style.display = 'none';
		}
		
		// Handle icon like VS Code's tree renderer
		this.renderIcon(templateData);
	}

	disposeTemplate(templateData: IQueryHistoryTemplateData): void {
		templateData.resourceLabel.dispose();
	}

	private renderIcon(templateData: IQueryHistoryTemplateData): void {
		// Remove icon completely to eliminate left spacing
		templateData.icon.style.display = 'none';
		templateData.icon.style.width = '0';
		templateData.icon.style.minWidth = '0';
		templateData.icon.style.padding = '0';
		templateData.icon.style.margin = '0';
	}

	private truncateSQL(sql: string, maxLength: number): string {
		if (sql.length <= maxLength) return sql;
		
		// Clean up whitespace and truncate
		const cleaned = sql.replace(/\s+/g, ' ').trim();
		if (cleaned.length <= maxLength) return cleaned;
		
		return cleaned.substring(0, maxLength - 3) + '...';
	}

	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();
		
		if (isToday) {
			// Show just the time for today's queries
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else {
			// Show date and time for older queries
			return date.toLocaleString([], { 
				month: 'short', 
				day: 'numeric', 
				hour: '2-digit', 
				minute: '2-digit' 
			});
		}
	}

	private formatExecutionTime(executionTime: number): string {
		if (executionTime < 1000) {
			return `${executionTime}ms`;
		} else if (executionTime < 60000) {
			return `${(executionTime / 1000).toFixed(1)}s`;
		} else {
			const minutes = Math.floor(executionTime / 60000);
			const seconds = Math.floor((executionTime % 60000) / 1000);
			return `${minutes}m ${seconds}s`;
		}
	}
}

class QueryHistoryDataSource implements IAsyncDataSource<IHistoryItem, IQueryHistoryTreeElement> {
	constructor(
		private readonly commandService: ICommandService,
		private readonly telemetryService: ITelemetryService
	) { 
	}

	hasChildren(element: IHistoryItem | IQueryHistoryTreeElement): boolean {
		// Root element has children (history items), but history items themselves don't have children
		if (!element || !('element' in element)) {
			return true;
		}
		return false;
	}

	async getChildren(element: IHistoryItem | IQueryHistoryTreeElement): Promise<IQueryHistoryTreeElement[]> {
		try {
			// For root element, get all history items
			if (!element || !('element' in element)) {
				const historyItems = await this.commandService.executeCommand<IHistoryItem[]>(
					'erdos.getQueryHistoryItems'
				);
				return (historyItems || []).map(item => ({ element: item }));
			}

			// History items don't have children
			return [];
		} catch (error: any) {
			console.error('[QueryHistoryDataSource] Error loading history:', error);
			this.telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Query history data source error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from query history data source' };
			}>('erdos.queryHistoryDataSourceError', {
				error: error.message || 'Unknown error'
			});

			return [];
		}
	}
}

class QueryHistoryIdentityProvider implements IIdentityProvider<IQueryHistoryTreeElement> {
	getId(element: IQueryHistoryTreeElement): string {
		return element.element.id;
	}
}

class QueryHistoryAccessibilityProvider implements IListAccessibilityProvider<IQueryHistoryTreeElement> {
	getAriaLabel(element: IQueryHistoryTreeElement): string {
		const item = element.element;
		return `Query: ${item.sql.substring(0, 50)} on ${item.connectionName} at ${new Date(item.timestamp).toLocaleString()}`;
	}

	getWidgetAriaLabel(): string {
		return localize('queryHistory', 'Query History');
	}
}

/**
 * Query History View - creates a native VS Code tree view for query history.
 * Shows recent queries with ability to re-run them.
 */
export class QueryHistoryView extends ViewPane {

	public static readonly ID = 'erdosDatabaseClient.history';
	public static readonly TITLE = localize('queryHistory.title', 'Query History');

	private _tree?: WorkbenchAsyncDataTree<IHistoryItem, IQueryHistoryTreeElement, FuzzyScore>;
	private _treeContainer?: HTMLElement;
	private _resourceLabels?: ResourceLabels;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
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

		const delegate = new QueryHistoryVirtualDelegate();
		const renderer = new QueryHistoryRenderer(this._resourceLabels);
		const dataSource = new QueryHistoryDataSource(
			this._commandService,
			this._telemetryService
		);
		const identityProvider = new QueryHistoryIdentityProvider();
		const accessibilityProvider = new QueryHistoryAccessibilityProvider();

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'QueryHistory',
			this._treeContainer,
			delegate,
			[renderer],
			dataSource,
			{
				identityProvider,
				accessibilityProvider,
				multipleSelectionSupport: false,
				collapseByDefault: () => false, // History items don't collapse
				openOnSingleClick: false,
				expandOnlyOnTwistieClick: () => false // No twisties for history items
			}
		) as WorkbenchAsyncDataTree<IHistoryItem, IQueryHistoryTreeElement, FuzzyScore>;

		// Register the tree instance for proper disposal to prevent leaked disposables
		this._register(this._tree);

		// Set up event handlers
		this._tree.onDidOpen((e: { element?: IQueryHistoryTreeElement }) => {
			if (e.element) {
				this._handleHistoryItemDoubleClick(e.element.element);
			}
		});

		// Load initial data
		this._loadHistoryItems();
	}

	private async _loadHistoryItems(): Promise<void> {
		if (!this._tree) {
			return;
		}

		try {
			// Create a dummy root node to trigger data source - must set input BEFORE calling updateChildren
			const rootNode: IHistoryItem = {
				id: 'root',
				sql: '',
				connectionId: '',
				connectionName: '',
				timestamp: 0
			};

			await this._tree.setInput(rootNode);
			
			// Force a layout update (like database explorer does)
			this._tree.layout();
			
		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Query history loading error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from query history loading' };
			}>('erdos.loadQueryHistoryError', {
				error: error.message || 'Unknown error'
			});

		}
	}

	private async _handleHistoryItemDoubleClick(historyItem: IHistoryItem): Promise<void> {
		try {
			// Get the connection details
			const connection = await this._commandService.executeCommand<IDatabaseConnection>('erdos.getConnection', historyItem.connectionId);
			if (!connection) {
				throw new Error('Cannot find connection details for history item');
			}

			// Create a new query results editor with the historical query
			const input = new QueryResultsInput(historyItem.connectionId, historyItem.sql);

			// Open the editor
			await this._editorService.openEditor(input, { pinned: true });

			// Log telemetry
			this._telemetryService.publicLog2<{ connectionId: string; sqlLength: number }, {
				owner: 'erdos-database-client';
				comment: 'Query history item opened tracking';
				connectionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Connection ID for history item' };
				sqlLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Length of SQL query' };
			}>('erdos.queryHistoryItemOpened', {
				connectionId: historyItem.connectionId,
				sqlLength: historyItem.sql.length
			});

		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; historyItemId: string }, {
				owner: 'erdos-database-client';
				comment: 'Query history item double-click error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from history item double-click' };
				historyItemId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ID of history item double-clicked' };
			}>('erdos.queryHistoryItemDoubleClickError', {
				error: error.message || 'Unknown error',
				historyItemId: historyItem.id
			});

		}
	}

	public refresh(): void {
		this._loadHistoryItems();
	}

	public async clearHistory(): Promise<void> {
		try {
			await this._commandService.executeCommand('erdos.clearHistory');
			this.refresh();
			
			this._telemetryService.publicLog2<{}, {
				owner: 'erdos-database-client';
				comment: 'Query history cleared tracking';
			}>('erdos.queryHistoryCleared', {});

		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string }, {
				owner: 'erdos-database-client';
				comment: 'Clear query history error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from clear history' };
			}>('erdos.clearQueryHistoryError', {
				error: error.message || 'Unknown error'
			});

		}
	}

	public async deleteHistoryItem(historyId: string): Promise<void> {
		try {
			await this._commandService.executeCommand('erdos.deleteHistoryItem', historyId);
			this.refresh();
			
			this._telemetryService.publicLog2<{ historyId: string }, {
				owner: 'erdos-database-client';
				comment: 'Query history item deleted tracking';
				historyId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ID of deleted history item' };
			}>('erdos.queryHistoryItemDeleted', {
				historyId
			});

		} catch (error: any) {
			this._telemetryService.publicLog2<{ error: string; historyId: string }, {
				owner: 'erdos-database-client';
				comment: 'Delete query history item error tracking';
				error: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Error message from delete history item' };
				historyId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ID of history item to delete' };
			}>('erdos.deleteQueryHistoryItemError', {
				error: error.message || 'Unknown error',
				historyId
			});

		}
	}
}
