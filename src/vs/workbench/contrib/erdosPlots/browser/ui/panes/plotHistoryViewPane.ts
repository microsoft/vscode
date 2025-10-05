/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../styles/plotHistoryView.css';

import { ViewPane } from '../../../../../browser/parts/views/viewPane.js';
import { IViewPaneOptions } from '../../../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IErdosPlotsService, IPlotHistoryGroup, IErdosPlotClient } from '../../../common/erdosPlotsService.js';
import { WorkbenchAsyncDataTree } from '../../../../../../platform/list/browser/listService.js';
import { IAsyncDataSource } from '../../../../../../base/browser/ui/tree/tree.js';
import { IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { ITreeRenderer, ITreeNode } from '../../../../../../base/browser/ui/tree/tree.js';
import { FuzzyScore } from '../../../../../../base/common/filters.js';
import { IIdentityProvider } from '../../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../../base/browser/ui/list/listWidget.js';
import { localize } from '../../../../../../nls.js';
import { ILanguageRuntimeService } from '../../../../../services/languageRuntime/common/languageRuntimeService.js';

interface FileGroup {
	source: string;
	groups: IPlotHistoryGroup[];
}

interface PlotListContainer {
	groupId: string;
	plots: IErdosPlotClient[];
}

type PlotHistoryTreeElement = FileGroup | IPlotHistoryGroup | PlotListContainer;

interface IFileGroupTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly deleteButton: HTMLElement;
}

interface ITimeGroupTemplateData {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly deleteButton: HTMLElement;
}

interface IPlotListTemplateData {
	readonly container: HTMLElement;
	readonly plotsContainer: HTMLElement;
}

class PlotHistoryVirtualDelegate implements IListVirtualDelegate<{ element: PlotHistoryTreeElement }> {
	getHeight(element: { element: PlotHistoryTreeElement }): number {
		if ('groups' in element.element) {
			return 22;
		}
		if ('plotIds' in element.element) {
			return 22;
		}
		return 90;
	}

	getTemplateId(element: { element: PlotHistoryTreeElement }): string {
		if ('groups' in element.element) {
			return 'file-group';
		}
		if ('plotIds' in element.element) {
			return 'time-group';
		}
		return 'plot-list';
	}
}

class FileGroupRenderer implements ITreeRenderer<{ element: PlotHistoryTreeElement }, FuzzyScore, IFileGroupTemplateData> {
	templateId = 'file-group';

	constructor(
		private readonly erdosPlotsService: IErdosPlotsService,
		private readonly languageRuntimeService: ILanguageRuntimeService
	) { }

	renderTemplate(container: HTMLElement): IFileGroupTemplateData {
		container.classList.add('plot-history-file-group');

		const icon = document.createElement('img');
		icon.className = 'file-group-icon';
		container.appendChild(icon);

		const label = document.createElement('div');
		label.className = 'file-group-label';
		container.appendChild(label);

		const deleteButton = document.createElement('div');
		deleteButton.className = 'codicon codicon-trash plot-history-delete-button';
		deleteButton.title = 'Delete all plots from this file';
		container.appendChild(deleteButton);

		return { container, icon, label, deleteButton };
	}

	renderElement(element: ITreeNode<{ element: PlotHistoryTreeElement }, FuzzyScore>, index: number, templateData: IFileGroupTemplateData): void {
		const fileGroup = element.element.element as FileGroup;
		templateData.label.textContent = fileGroup.source;
				
		// Get the language from the first plot in the first group
		let languageId: string | undefined;
		if (fileGroup.groups.length > 0 && fileGroup.groups[0].plotIds.length > 0) {
			const firstPlotId = fileGroup.groups[0].plotIds[0];
			const firstPlot = this.erdosPlotsService.allPlots.find(p => p.id === firstPlotId);
			if (firstPlot) {
				if (firstPlot.metadata.language) {
					languageId = firstPlot.metadata.language;
				}
			}
		}

		// Get and set the language icon
		if (languageId) {
			const runtime = this.languageRuntimeService.registeredRuntimes.find((r: any) => r.languageId === languageId);
			if (runtime?.base64EncodedIconSvg) {
				const iconSrc = `data:image/svg+xml;base64,${runtime.base64EncodedIconSvg}`;
				(templateData.icon as HTMLImageElement).src = iconSrc;
				templateData.icon.style.display = 'block';
			} else {
				templateData.icon.style.display = 'none';
			}
		} else {
			templateData.icon.style.display = 'none';
		}
		
		
		templateData.deleteButton.onclick = (e) => {
			e.stopPropagation();
			// Collect all plot IDs from all groups in this file
			const plotIds: string[] = [];
			fileGroup.groups.forEach(group => {
				plotIds.push(...group.plotIds);
			});
			// Batch delete
			(this.erdosPlotsService as any).deletePlots(plotIds);
		};
	}

	disposeTemplate(templateData: IFileGroupTemplateData): void {
	}
}

class TimeGroupRenderer implements ITreeRenderer<{ element: PlotHistoryTreeElement }, FuzzyScore, ITimeGroupTemplateData> {
	templateId = 'time-group';

	constructor(
		private readonly erdosPlotsService: IErdosPlotsService
	) { }

	renderTemplate(container: HTMLElement): ITimeGroupTemplateData {
		container.classList.add('plot-history-time-group');

		const label = document.createElement('div');
		label.className = 'time-group-label';
		container.appendChild(label);

		const deleteButton = document.createElement('div');
		deleteButton.className = 'codicon codicon-trash plot-history-delete-button';
		deleteButton.title = 'Delete plots from this execution';
		container.appendChild(deleteButton);

		return { container, label, deleteButton };
	}

	renderElement(element: ITreeNode<{ element: PlotHistoryTreeElement }, FuzzyScore>, index: number, templateData: ITimeGroupTemplateData): void {
		const group = element.element.element as IPlotHistoryGroup;
		const timestamp = this.formatTimestamp(group.timestamp);
		templateData.label.textContent = timestamp;
		
		templateData.deleteButton.onclick = (e) => {
			e.stopPropagation();
			// Batch delete all plots in this group
			(this.erdosPlotsService as any).deletePlots([...group.plotIds]);
		};
	}

	disposeTemplate(templateData: ITimeGroupTemplateData): void {
	}

	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleString([], {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).replace(',', ':').replace(', ', ': ');
	}
}

class PlotListRenderer implements ITreeRenderer<{ element: PlotHistoryTreeElement }, FuzzyScore, IPlotListTemplateData> {
	templateId = 'plot-list';

	constructor(
		private readonly erdosPlotsService: IErdosPlotsService
	) { }

	renderTemplate(container: HTMLElement): IPlotListTemplateData {
		container.classList.add('plot-history-plot-list');

		const plotsContainer = document.createElement('div');
		plotsContainer.className = 'plot-history-plots-container';
		container.appendChild(plotsContainer);

		// Enable horizontal scrolling with wheel events
		// Monaco list blocks wheel events by default, so we need to handle them manually
		container.addEventListener('wheel', (e) => {
			// Only handle horizontal scroll events (shift+wheel or trackpad horizontal swipe)
			if (e.deltaX !== 0 && container.scrollWidth > container.clientWidth) {
				// Prevent the event from bubbling up to monaco-list
				e.preventDefault();
				e.stopPropagation();
				
				// Scroll horizontally
				container.scrollLeft += e.deltaX;
			}
		}, { passive: false, capture: true });

		return { container, plotsContainer };
	}

	renderElement(element: ITreeNode<{ element: PlotHistoryTreeElement }, FuzzyScore>, index: number, templateData: IPlotListTemplateData): void {
		const plotListContainer = element.element.element as PlotListContainer;

		// Clean up previous listeners
		if ((templateData as any).plotListeners) {
			(templateData as any).plotListeners.forEach((l: any) => l.dispose());
		}
		(templateData as any).plotListeners = [];

		// Clear container (use DOM methods for Trusted Types compliance)
		while (templateData.plotsContainer.firstChild) {
			templateData.plotsContainer.removeChild(templateData.plotsContainer.firstChild);
		}

		// Render all plots horizontally
		plotListContainer.plots.forEach((plot, idx) => {
			const thumbnailWrapper = document.createElement('div');
			thumbnailWrapper.className = 'plot-history-thumbnail-item';

			const img = document.createElement('img');
			img.className = 'plot';

			const updateThumbnail = () => {
				const uri = this.getPlotUri(plot);
				if (uri) {
					img.src = uri;
				}
			};

			updateThumbnail();

			if ('onDidChangeState' in plot) {
				const listener = (plot as any).onDidChangeState((state: any) => {
					updateThumbnail();
				});
				(templateData as any).plotListeners.push(listener);
			}

			// Listen for thumbnail renders (InteractivePlotEngine/HtmlPlotClient)
			if ('onDidRenderThumbnail' in plot) {
				const listener = (plot as any).onDidRenderThumbnail((dataUrl: string) => {
					updateThumbnail();
				});
				(templateData as any).plotListeners.push(listener);
			}

			// Create tooltip: "filename.py - Plot 1 - 2:30 PM" or "Console - Plot 1 - 2:30 PM"
			const sourceName = plot.metadata.source_file 
				? plot.metadata.source_file.split('/').pop() || 'Unknown'
				: plot.metadata.source_type || 'Console';
			const plotIndex = idx + 1;
			const timeStr = new Date(plot.metadata.created).toLocaleTimeString(undefined, { 
				hour: 'numeric', 
				minute: '2-digit'
			});
			img.title = `${sourceName} - Plot ${plotIndex} - ${timeStr}`;
			img.onclick = () => this.erdosPlotsService.activatePlot(plot.id);

			thumbnailWrapper.appendChild(img);
			templateData.plotsContainer.appendChild(thumbnailWrapper);
		});
	}

	disposeTemplate(templateData: IPlotListTemplateData): void {
		if ((templateData as any).plotListeners) {
			(templateData as any).plotListeners.forEach((l: any) => l.dispose());
		}
	}

	private getPlotUri(plot: IErdosPlotClient): string | undefined {
		if ('thumbnailUri' in plot) {
			const uri = (plot as any).thumbnailUri;
			if (uri) return uri;
		}
		if ('dataUri' in plot) {
			const uri = (plot as any).dataUri;
			if (uri) return uri;
		}
		if ('lastRender' in plot && (plot as any).lastRender) {
			const uri = (plot as any).lastRender.uri;
			if (uri) return uri;
		}
		return undefined;
	}
}

class PlotHistoryDataSource implements IAsyncDataSource<FileGroup, { element: PlotHistoryTreeElement }> {
	constructor(
		private readonly erdosPlotsService: IErdosPlotsService
	) { }

	hasChildren(element: FileGroup | { element: PlotHistoryTreeElement } | null): boolean {
		if (!element) {
			return this.erdosPlotsService.historyGroups.length > 0;
		}
		if ('element' in element) {
			const el = element.element;
			if ('groups' in el) {
				return el.groups.length > 0;
			}
			if ('plotIds' in el) {
				return el.plotIds.length > 0;
			}
			// PlotListContainer has no children
			if ('plots' in el) {
				return false;
			}
		}
		return false;
	}

	async getChildren(element: FileGroup | { element: PlotHistoryTreeElement } | null): Promise<{ element: PlotHistoryTreeElement }[]> {
		if (!element || element === null) {
			const allGroups = this.erdosPlotsService.historyGroups;
			
			const fileGroupMap = new Map<string, IPlotHistoryGroup[]>();

			allGroups.forEach(group => {
				const key = group.source || 'Console';
				if (!fileGroupMap.has(key)) {
					fileGroupMap.set(key, []);
				}
				fileGroupMap.get(key)!.push(group);
			});

			const fileGroups: FileGroup[] = [];
			fileGroupMap.forEach((groups, source) => {
				groups.sort((a, b) => b.timestamp - a.timestamp);
				fileGroups.push({
					source,
					groups
				});
			});

			fileGroups.sort((a, b) => {
				const aMaxTime = Math.max(...a.groups.map(g => g.timestamp));
				const bMaxTime = Math.max(...b.groups.map(g => g.timestamp));
				return bMaxTime - aMaxTime;
			});

			return fileGroups.map(fg => ({ element: fg }));
		}

		if ('element' in element) {
			const el = element.element;
			
			if ('groups' in el) {
				const fileGroup = el as FileGroup;
				return fileGroup.groups.map(group => ({ element: group }));
			}
			
			if ('plotIds' in el) {
				const group = el as IPlotHistoryGroup;
				const plots = this.erdosPlotsService.fetchPlotsInGroup(group.id);
				return [{
					element: {
						groupId: group.id,
						plots: plots
					} as PlotListContainer
				}];
			}
		}

		return [];
	}
}

class PlotHistoryIdentityProvider implements IIdentityProvider<{ element: PlotHistoryTreeElement }> {
	getId(element: { element: PlotHistoryTreeElement }): string {
		if ('groups' in element.element) {
			return `file-${element.element.source}`;
		}
		if ('plotIds' in element.element) {
			return element.element.id;
		}
		const container = element.element as PlotListContainer;
		return `plot-list-${container.groupId}`;
	}
}

class PlotHistoryAccessibilityProvider implements IListAccessibilityProvider<{ element: PlotHistoryTreeElement }> {
	getAriaLabel(element: { element: PlotHistoryTreeElement }): string {
		if ('groups' in element.element) {
			const fileGroup = element.element as FileGroup;
			return localize('plotHistoryFileAriaLabel', '{0}, {1} executions', fileGroup.source, fileGroup.groups.length);
		}
		if ('plotIds' in element.element) {
			const group = element.element as IPlotHistoryGroup;
			return localize('plotHistoryTimeAriaLabel', '{0}, {1} plots', new Date(group.timestamp).toLocaleString(), group.plotIds.length);
		}
		const container = element.element as PlotListContainer;
		return localize('plotHistoryPlotListAriaLabel', '{0} plots', container.plots.length);
	}

	getWidgetAriaLabel(): string {
		return localize('plotHistory', 'Plot History');
	}
}

export class PlotHistoryViewPane extends ViewPane {
	public static readonly ID = 'workbench.panel.erdosPlotsHistory';

	private _tree?: WorkbenchAsyncDataTree<FileGroup | null, { element: PlotHistoryTreeElement }, FuzzyScore>;
	private _treeContainer?: HTMLElement;

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
		@IErdosPlotsService private readonly _erdosPlotsService: IErdosPlotsService,
		@ILanguageRuntimeService private readonly _languageRuntimeService: ILanguageRuntimeService
	) {
		super(
			options,
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

		this._register(this._erdosPlotsService.onHistoryChanged(() => {
			this.refresh();
		}));

		this._register(this._erdosPlotsService.onPlotCreated(() => {
			this.refresh();
		}));

		this._register(this._erdosPlotsService.onPlotDeleted(() => {
			this.refresh();
		}));

		this._register(this._erdosPlotsService.onPlotsReplaced(() => {
			this.refresh();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		this._treeContainer = container;
		this._createTree();
	}

	override dispose(): void {
		this._tree?.dispose();
		super.dispose();
	}

	private _createTree(): void {
		if (!this._treeContainer) {
			return;
		}

		const delegate = new PlotHistoryVirtualDelegate();
		const fileGroupRenderer = new FileGroupRenderer(this._erdosPlotsService, this._languageRuntimeService);
		const timeGroupRenderer = new TimeGroupRenderer(this._erdosPlotsService);
		const plotListRenderer = new PlotListRenderer(this._erdosPlotsService);
		const dataSource = new PlotHistoryDataSource(this._erdosPlotsService);
		const identityProvider = new PlotHistoryIdentityProvider();
		const accessibilityProvider = new PlotHistoryAccessibilityProvider();

		this._tree = this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'PlotHistory',
			this._treeContainer,
			delegate,
			[fileGroupRenderer, timeGroupRenderer, plotListRenderer],
			dataSource,
			{
				identityProvider,
				accessibilityProvider,
				multipleSelectionSupport: false,
				collapseByDefault: () => false,
				openOnSingleClick: false,
				expandOnlyOnTwistieClick: false
			}
		) as WorkbenchAsyncDataTree<FileGroup | null, { element: PlotHistoryTreeElement }, FuzzyScore>;

		this._register(this._tree);

		this._loadHistoryGroups();
	}

	private async _loadHistoryGroups(): Promise<void> {
		if (!this._tree) {
			return;
		}

		await this._tree.setInput(null);
		this._tree.layout();
	}

	public refresh(): void {
		if (this._tree) {
			// Clear any cached state and force complete refresh
			this._tree.rerender();
		}
		this._loadHistoryGroups();
	}
}

