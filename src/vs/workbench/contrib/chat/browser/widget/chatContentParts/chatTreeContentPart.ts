/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { ITreeCompressionDelegate } from '../../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../../../base/browser/ui/tree/objectTree.js';
import { IAsyncDataSource, ITreeNode } from '../../../../../../base/browser/ui/tree/tree.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { FileKind, FileType } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { IFilesConfiguration } from '../../../../files/common/files.js';
import { IChatResponseProgressFileTreeData } from '../../../common/chatService/chatService.js';
import { IChatProgressRenderableResponseContent } from '../../../common/model/chatModel.js';
import { IDisposableReference, ResourcePool } from './chatCollections.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

export class ChatTreeContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	public readonly onDidFocus: Event<void>;

	private tree: WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>;

	constructor(
		data: IChatResponseProgressFileTreeData,
		treePool: TreePool,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();

		const ref = this._register(treePool.get());
		this.tree = ref.object;
		this.onDidFocus = this.tree.onDidFocus;

		this._register(this.tree.onDidOpen((e) => {
			if (e.element && !('children' in e.element)) {
				this.openerService.open(e.element.uri);
			}
		}));
		this._register(this.tree.onContextMenu((e) => {
			e.browserEvent.preventDefault();
			e.browserEvent.stopPropagation();
		}));

		this.tree.setInput(data).then(() => {
			if (!ref.isStale()) {
				this.tree.layout();
			}
		});

		this.domNode = this.tree.getHTMLElement().parentElement!;
	}

	domFocus() {
		this.tree.domFocus();
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'treeData';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

interface ITreePoolWrapper extends IDisposable {
	tree: WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>;
}

export class TreePool extends Disposable {
	private _pool: ResourcePool<ITreePoolWrapper>;

	public get inUse(): ReadonlySet<ITreePoolWrapper> {
		return this._pool.inUse;
	}

	constructor(
		private _onDidChangeVisibility: Event<boolean>,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.treeFactory()));
	}

	private treeFactory(): ITreePoolWrapper {
		const store = new DisposableStore();
		const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility }));

		const container = $('.interactive-response-progress-tree');
		store.add(createFileIconThemableTreeContainerScope(container, this.themeService));

		const tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData>,
			'ChatListRenderer',
			container,
			new ChatListTreeDelegate(),
			new ChatListTreeCompressionDelegate(),
			[new ChatListTreeRenderer(resourceLabels, this.configService.getValue('explorer.decorations'))],
			new ChatListTreeDataSource(),
			{
				collapseByDefault: () => false,
				expandOnlyOnTwistieClick: () => false,
				identityProvider: {
					getId: (e: IChatResponseProgressFileTreeData) => e.uri.toString()
				},
				accessibilityProvider: {
					getAriaLabel: (element: IChatResponseProgressFileTreeData) => element.label,
					getWidgetAriaLabel: () => localize('treeAriaLabel', "File Tree")
				},
				alwaysConsumeMouseWheel: false
			});

		return {
			tree,
			dispose: () => store.dispose()
		};
	}

	get(): IDisposableReference<WorkbenchCompressibleAsyncDataTree<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData, void>> {
		const wrapper = this._pool.get();
		let stale = false;
		return {
			object: wrapper.tree,
			isStale: () => stale,
			dispose: () => {
				stale = true;
				this._pool.release(wrapper);
			}
		};
	}

	clear(): void {
		this._pool.clear();
	}
}

class ChatListTreeDelegate implements IListVirtualDelegate<IChatResponseProgressFileTreeData> {
	static readonly ITEM_HEIGHT = 22;

	getHeight(element: IChatResponseProgressFileTreeData): number {
		return ChatListTreeDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IChatResponseProgressFileTreeData): string {
		return 'chatListTreeTemplate';
	}
}

class ChatListTreeCompressionDelegate implements ITreeCompressionDelegate<IChatResponseProgressFileTreeData> {
	isIncompressible(element: IChatResponseProgressFileTreeData): boolean {
		return !element.children;
	}
}

interface IChatListTreeRendererTemplate {
	templateDisposables: DisposableStore;
	label: IResourceLabel;
}

class ChatListTreeRenderer implements ICompressibleTreeRenderer<IChatResponseProgressFileTreeData, void, IChatListTreeRendererTemplate> {
	templateId: string = 'chatListTreeTemplate';

	constructor(private labels: ResourceLabels, private decorations: IFilesConfiguration['explorer']['decorations']) { }

	renderCompressedElements(element: ITreeNode<ICompressedTreeNode<IChatResponseProgressFileTreeData>, void>, index: number, templateData: IChatListTreeRendererTemplate): void {
		templateData.label.element.style.display = 'flex';
		const label = element.element.elements.map((e) => e.label);
		templateData.label.setResource({ resource: element.element.elements[0].uri, name: label }, {
			title: element.element.elements[0].label,
			fileKind: element.children ? FileKind.FOLDER : FileKind.FILE,
			extraClasses: ['explorer-item'],
			fileDecorations: this.decorations
		});
	}
	renderTemplate(container: HTMLElement): IChatListTreeRendererTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
		return { templateDisposables, label };
	}
	renderElement(element: ITreeNode<IChatResponseProgressFileTreeData, void>, index: number, templateData: IChatListTreeRendererTemplate): void {
		templateData.label.element.style.display = 'flex';
		if (!element.children.length && element.element.type !== FileType.Directory) {
			templateData.label.setFile(element.element.uri, {
				fileKind: FileKind.FILE,
				hidePath: true,
				fileDecorations: this.decorations,
			});
		} else {
			templateData.label.setResource({ resource: element.element.uri, name: element.element.label }, {
				title: element.element.label,
				fileKind: FileKind.FOLDER,
				fileDecorations: this.decorations
			});
		}
	}
	disposeTemplate(templateData: IChatListTreeRendererTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

class ChatListTreeDataSource implements IAsyncDataSource<IChatResponseProgressFileTreeData, IChatResponseProgressFileTreeData> {
	hasChildren(element: IChatResponseProgressFileTreeData): boolean {
		return !!element.children;
	}

	async getChildren(element: IChatResponseProgressFileTreeData): Promise<Iterable<IChatResponseProgressFileTreeData>> {
		return element.children ?? [];
	}
}
