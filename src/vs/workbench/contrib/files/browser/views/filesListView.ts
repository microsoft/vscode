/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { WorkbenchAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IAsyncDataSource, ITreeRenderer, ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { URI } from '../../../../../base/common/uri.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IIconLabelValueOptions, IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

interface IFileItem {
	uri: URI;
	name: string;
	isDirectory: boolean;
}

class FileListDelegate implements IListVirtualDelegate<IFileItem> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return 'fileItem';
	}
}

interface IFileItemTemplate {
	label: IconLabel;
	disposables: DisposableStore;
}

class FileListRenderer implements ITreeRenderer<IFileItem, FuzzyScore, IFileItemTemplate> {
	readonly templateId = 'fileItem';

	constructor(
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) { }

	renderTemplate(container: HTMLElement): IFileItemTemplate {
		const disposables = new DisposableStore();
		const label = disposables.add(new IconLabel(container, { supportHighlights: true }));
		return { label, disposables };
	}

	renderElement(element: ITreeNode<IFileItem, FuzzyScore>, index: number, templateData: IFileItemTemplate): void {
		const file = element.element;
		const iconClasses = getIconClasses(
			this.modelService,
			this.languageService,
			file.uri,
			file.isDirectory ? FileKind.FOLDER : FileKind.FILE
		);

		const options: IIconLabelValueOptions = {
			matches: createMatches(element.filterData),
			extraClasses: iconClasses
		};

		templateData.label.setLabel(file.name, undefined, options);
	}

	disposeTemplate(templateData: IFileItemTemplate): void {
		templateData.disposables.dispose();
	}
}

class FileListDataSource implements IAsyncDataSource<URI, IFileItem> {

	constructor(
		@IFileService private readonly fileService: IFileService,
	) { }

	hasChildren(element: URI | IFileItem): boolean {
		if (element instanceof URI) {
			return true;
		}
		return element.isDirectory;
	}

	async getChildren(element: URI | IFileItem): Promise<IFileItem[]> {
		const uri = element instanceof URI ? element : element.uri;
		
		try {
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return [];
			}

			return stat.children.map(child => ({
				uri: child.resource,
				name: child.name,
				isDirectory: child.isDirectory
			}));
		} catch (error) {
			return [];
		}
	}
}

export class FilesListView extends ViewPane {

	static readonly ID = 'workbench.files.filesListView';
	static readonly TITLE = nls.localize2('filesListView', "Files List");

	private tree?: WorkbenchAsyncDataTree<URI | IFileItem, IFileItem, FuzzyScore>;

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const treeContainer = document.createElement('div');
		treeContainer.classList.add('files-list-view-tree');
		container.appendChild(treeContainer);

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchAsyncDataTree,
			'FilesListView',
			treeContainer,
			new FileListDelegate(),
			[this.instantiationService.createInstance(FileListRenderer)],
			this.instantiationService.createInstance(FileListDataSource),
			{
				identityProvider: {
					getId: (element: URI | IFileItem) => {
						if (element instanceof URI) {
							return element.toString();
						}
						return element.uri.toString();
					}
				},
				accessibilityProvider: {
					getAriaLabel: (element: IFileItem) => element.name,
					getWidgetAriaLabel: () => nls.localize('filesListView', 'Files List')
				},
				multipleSelectionSupport: false,
			}
		) as WorkbenchAsyncDataTree<URI | IFileItem, IFileItem, FuzzyScore>);

		this.updateTreeInput();
	}

	private async updateTreeInput(): Promise<void> {
		if (!this.tree) {
			return;
		}

		const workspaceFolder = this.workspaceContextService.getWorkspace().folders[0];
		if (workspaceFolder) {
			const rootItem: IFileItem = {
				uri: workspaceFolder.uri,
				name: workspaceFolder.name,
				isDirectory: true
			};
			await this.tree.setInput(rootItem);
			await this.tree.expand(rootItem);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree?.layout(height, width);
	}
}
