/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize2 } from '../../../../../../nls.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChatEditingSession, IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatChangesSummaryPart as IChatFileChangesSummaryPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

export class ChatCheckpointFileChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	public readonly ELEMENT_HEIGHT = 22;
	public readonly MAX_ITEMS_SHOWN = 6;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly diffsBetweenRequests = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();

	private fileChangesDiffsObservable: IObservable<readonly IEditSessionEntryDiff[]>;

	private list!: WorkbenchList<IEditSessionEntryDiff>;
	private isCollapsed: boolean = true;

	constructor(
		private readonly content: IChatFileChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.fileChangesDiffsObservable = this.computeFileChangesDiffs(content);

		const headerDomNode = $('.checkpoint-file-changes-summary-header');
		this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderFilesList(this.domNode));
	}

	private computeFileChangesDiffs({ requestId, sessionResource }: IChatFileChangesSummaryPart) {
		return this.chatService.chatModels
			.map(models => Iterable.find(models, m => isEqual(m.sessionResource, sessionResource)))
			.map(model => model?.editingSession?.getDiffsForFilesInRequest(requestId))
			.map((diffs, r) => diffs?.read(r) || Iterable.empty());
	}

	public getCachedEntryDiffBetweenRequests(editSession: IChatEditingSession, uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> | undefined {
		const key = `${uri}\0${startRequestId}\0${stopRequestId}`;
		let observable = this.diffsBetweenRequests.get(key);
		if (!observable) {
			observable = editSession.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
			this.diffsBetweenRequests.set(key, observable);
		}
		return observable;
	}

	private renderHeader(container: HTMLElement): IDisposable {
		const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
		const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});

		this._register(autorun(r => {
			const diffs = this.fileChangesDiffsObservable.read(r);
			viewListButton.label = diffs.length === 1 ? `Changed 1 file` : `Changed ${diffs.length} files`;
		}));

		const setExpansionState = () => {
			viewListButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			this.domNode.classList.toggle('chat-file-changes-collapsed', this.isCollapsed);
			this._onDidChangeHeight.fire();
		};
		setExpansionState();

		const disposables = new DisposableStore();
		disposables.add(viewListButton);
		disposables.add(viewListButton.onDidClick(() => {
			this.isCollapsed = !this.isCollapsed;
			setExpansionState();
		}));
		disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
		return toDisposable(() => disposables.dispose());
	}

	private renderViewAllFileChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild($('.chat-view-changes-icon'));
		this.hoverService.setupDelayedHover(button, () => ({
			content: localize2('chat.viewFileChangesSummary', 'View All File Changes')
		}));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		button.setAttribute('role', 'button');
		button.tabIndex = 0;

		return dom.addDisposableListener(button, 'click', (e) => {
			const resources: { originalUri: URI; modifiedUri?: URI }[] = this.fileChangesDiffsObservable.get().map(diff => ({
				originalUri: diff.originalURI,
				modifiedUri: diff.modifiedURI
			}));

			const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				source,
				'Checkpoint File Changes',
				resources.map(resource => {
					return new MultiDiffEditorItem(
						resource.originalUri,
						resource.modifiedUri,
						undefined,
					);
				}),
				false
			);
			this.editorGroupsService.activeGroup.openEditor(input);
			dom.EventHelper.stop(e, true);
		});
	}

	private renderFilesList(container: HTMLElement): IDisposable {
		const store = new DisposableStore();
		this.list = store.add(this.instantiationService.createInstance(CollapsibleChangesSummaryListPool)).get();
		const listNode = this.list.getHTMLElement();
		container.appendChild(listNode.parentElement!);

		store.add(this.list.onDidOpen((item) => {
			const diff = item.element;
			if (!diff) {
				return;
			}

			const input = {
				original: { resource: diff.originalURI },
				modified: { resource: diff.modifiedURI },
				options: { preserveFocus: true }
			};

			this.editorService.openEditor(input);
		}));

		store.add(this.list.onContextMenu(e => {
			dom.EventHelper.stop(e.browserEvent, true);
		}));

		store.add(autorun((r) => {
			const diffs = this.fileChangesDiffsObservable.read(r);

			const itemsShown = Math.min(diffs.length, this.MAX_ITEMS_SHOWN);
			const height = itemsShown * this.ELEMENT_HEIGHT;
			this.list.layout(height);
			listNode.style.height = height + 'px';

			this.list.splice(0, this.list.length, diffs);
		}));

		return store;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'changesSummary' && other.requestId === this.content.requestId;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

interface IChatFileChangesSummaryListWrapper extends IDisposable {
	list: WorkbenchList<IEditSessionEntryDiff>;
}

class CollapsibleChangesSummaryListPool extends Disposable {

	private _resourcePool: ResourcePool<IChatFileChangesSummaryListWrapper>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
		this._resourcePool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): IChatFileChangesSummaryListWrapper {
		const container = $('.chat-summary-list');
		const store = new DisposableStore();
		store.add(createFileIconThemableTreeContainerScope(container, this.themeService));
		const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
		const list = store.add(this.instantiationService.createInstance(
			WorkbenchList<IEditSessionEntryDiff>,
			'ChatListRenderer',
			container,
			new CollapsibleChangesSummaryListDelegate(),
			[this.instantiationService.createInstance(CollapsibleChangesSummaryListRenderer, resourceLabels)],
			{
				alwaysConsumeMouseWheel: false
			}
		));
		return {
			list: list,
			dispose: () => {
				store.dispose();
			}
		};
	}

	get(): WorkbenchList<IEditSessionEntryDiff> {
		return this._resourcePool.get().list;
	}
}

interface ICollapsibleChangesSummaryListTemplate extends IDisposable {
	readonly label: IResourceLabel;
	changesElement?: HTMLElement;
}

class CollapsibleChangesSummaryListDelegate implements IListVirtualDelegate<IEditSessionEntryDiff> {

	getHeight(element: IEditSessionEntryDiff): number {
		return 22;
	}

	getTemplateId(element: IEditSessionEntryDiff): string {
		return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	}
}

class CollapsibleChangesSummaryListRenderer implements IListRenderer<IEditSessionEntryDiff, ICollapsibleChangesSummaryListTemplate> {

	static TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer';
	static CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
		return { label, dispose: () => label.dispose() };
	}

	renderElement(data: IEditSessionEntryDiff, index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		const label = templateData.label;
		label.setFile(data.modifiedURI, {
			fileKind: FileKind.FILE,
			title: data.modifiedURI.path
		});
		const labelElement = label.element;

		templateData.changesElement?.remove();

		if (!data.identical && !data.isBusy) {
			const changesSummary = labelElement.appendChild($(`.${CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));

			const added = changesSummary.appendChild($(`.insertions`));
			added.textContent = `+${data.added}`;

			const removed = changesSummary.appendChild($(`.deletions`));
			removed.textContent = `-${data.removed}`;

			templateData.changesElement = changesSummary;
		}
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.dispose();
	}
}
