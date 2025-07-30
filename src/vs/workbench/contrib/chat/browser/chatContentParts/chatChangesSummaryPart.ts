/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatChangesSummaryPart as IChatFileChangesSummaryPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatChangesSummary as IChatFileChangesSummary, IChatService } from '../../common/chatService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ResourcePool } from './chatCollections.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { autorun, derived, IObservableWithChange, ObservablePromise } from '../../../../../base/common/observable.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';

export class ChatCheckpointFileChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	public readonly ELEMENT_HEIGHT = 22;
	public readonly MAX_ITEMS_SHOWN = 6;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private fileChanges: readonly IChatFileChangesSummary[];
	private fileChangesDiffsObservable: IObservableWithChange<Map<string, ObservablePromise<IEditSessionEntryDiff>>, void>;

	private list!: WorkbenchList<IChatFileChangesSummaryItem>;
	private isCollapsed: boolean = true;

	constructor(
		content: IChatFileChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService
	) {
		super();

		console.log('content.fileChanges : ', content.fileChanges);
		this.fileChanges = content.fileChanges;
		this.fileChangesDiffsObservable = this.computeFileChangesDiffs(context, content.fileChanges);

		const headerDomNode = $('.checkpoint-file-changes-summary-header');
		this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderFilesList(this.domNode));
	}

	private changeID(change: IChatFileChangesSummary): string {
		return `${change.sessionId}-${change.requestId}-${change.reference.path}`;
	}

	private computeFileChangesDiffs(context: IChatContentPartRenderContext, changes: readonly IChatFileChangesSummary[]): IObservableWithChange<Map<string, ObservablePromise<IEditSessionEntryDiff>>, void> {
		return derived((r): Map<string, ObservablePromise<IEditSessionEntryDiff>> => {
			const fileChangesDiffs = new Map<string, ObservablePromise<IEditSessionEntryDiff>>();
			const firstRequestId = changes[0].requestId;
			const lastRequestId = changes[changes.length - 1].requestId;
			for (const change of changes) {
				const sessionId = change.sessionId;
				const session = this.chatService.getSession(sessionId);
				if (!session || !session.editingSessionObs) {
					continue;
				}
				const editSession = session.editingSessionObs.promiseResult.read(r)?.data;
				if (!editSession) {
					continue;
				}
				console.log('context.content : ', context.content);
				const uri = change.reference;
				console.log('firstRequestId : ', firstRequestId);
				console.log('lastRequestId : ', lastRequestId);
				const firstSnapshotUri = editSession.getFirstSnapshotForUriAfterRequest(uri, firstRequestId);
				const lastSnapshotUri = editSession.getFirstSnapshotForUriAfterRequest(uri, lastRequestId, false);
				console.log('firstSnapshotUri : ', firstSnapshotUri);
				console.log('lastSnapshotUri : ', lastSnapshotUri);
				if (!firstSnapshotUri || !lastSnapshotUri) {
					continue;
				}
				const diffPromise = this.editorWorkerService.computeDiff(firstSnapshotUri, lastSnapshotUri, { ignoreTrimWhitespace: true, maxComputationTimeMs: 1000, computeMoves: false }, 'advanced');
				const editEntryDiffPromise = diffPromise.then((diff) => {
					console.log('diff : ', diff);
					const entryDiff: IEditSessionEntryDiff = {
						originalURI: firstSnapshotUri,
						modifiedURI: lastSnapshotUri,
						identical: !!diff?.identical,
						quitEarly: !diff || diff.quitEarly,
						added: 0,
						removed: 0,
					};
					if (diff) {
						for (const change of diff.changes) {
							entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
							entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
						}
					}
					return entryDiff;
				});
				fileChangesDiffs.set(this.changeID(change), new ObservablePromise(editEntryDiffPromise));
			}
			return fileChangesDiffs;
		});
	}

	private renderHeader(container: HTMLElement): IDisposable {
		const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
		const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
		viewListButton.label = this.fileChanges.length === 1 ? `Changed 1 file` : `Changed ${this.fileChanges.length} files`;

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
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));

		return dom.addDisposableListener(button, 'click', async (e) => {
			const resources: { originalUri: URI; modifiedUri?: URI }[] = [];
			for (const fileChange of this.fileChanges) {
				const diffEntry = await this.fileChangesDiffsObservable.get().get(this.changeID(fileChange))?.promise;
				if (diffEntry) {
					resources.push({
						originalUri: diffEntry.originalURI,
						modifiedUri: diffEntry.modifiedURI
					});
				} else {
					resources.push({
						originalUri: fileChange.reference
					});
				}
			}
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
		this.updateList(this.fileChanges, this.fileChangesDiffsObservable.get());
		const listNode = this.list.getHTMLElement();
		const itemsShown = Math.min(this.fileChanges.length, this.MAX_ITEMS_SHOWN);
		const height = itemsShown * this.ELEMENT_HEIGHT;
		this.list.layout(height);
		listNode.style.height = height + 'px';
		container.appendChild(listNode.parentElement!);

		store.add(this.list.onDidOpen(async (item) => {
			const element = item.element;
			if (!element) {
				return;
			}
			const diff = await this.fileChangesDiffsObservable.get().get(this.changeID(element))?.promise;
			console.log('onDidOpen diff', diff);
			if (diff) {
				const input = {
					original: { resource: diff.originalURI },
					modified: { resource: diff.modifiedURI },
					options: { preserveFocus: true }
				};
				this.editorService.openEditor(input);
			} else {
				this.editorService.openEditor({ resource: element.reference, options: { preserveFocus: true } });
			}
		}));
		store.add(this.list.onContextMenu(e => {
			dom.EventHelper.stop(e.browserEvent, true);
		}));
		store.add(autorun((r) => {
			this.updateList(this.fileChanges, this.fileChangesDiffsObservable.read(r));
		}));
		return store;
	}

	private async updateList(fileChanges: readonly IChatFileChangesSummary[], fileChangesDiffs: Map<string, ObservablePromise<IEditSessionEntryDiff>>): Promise<void> {
		const items = await this.computeFileChangeSummaryItems(fileChanges, fileChangesDiffs);
		this.list.splice(0, this.list.length, items);
	}

	private async computeFileChangeSummaryItems(fileChanges: readonly IChatFileChangesSummary[], fileChangesDiffs: Map<string, ObservablePromise<IEditSessionEntryDiff>>): Promise<IChatFileChangesSummaryItem[]> {
		const items: IChatFileChangesSummaryItem[] = [];
		for (const fileChange of fileChanges) {
			const diffEntry = await fileChangesDiffs.get(this.changeID(fileChange))?.promise;
			if (diffEntry) {
				const additionalLabels: { description: string; className: string }[] = [];
				if (diffEntry) {
					additionalLabels.push({
						description: ` +${diffEntry.added} `,
						className: 'insertions',
					});
					additionalLabels.push({
						description: ` -${diffEntry.removed} `,
						className: 'deletions',
					});
				}
				const item: IChatFileChangesSummaryItem = {
					...fileChange,
					additionalLabels
				};
				items.push(item);
			} else {
				items.push(fileChange);
			}
		}
		return items;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'changesSummary' && other.fileChanges.length === this.fileChanges.length;
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

interface IChatFileChangesSummaryItem extends IChatFileChangesSummary {
	additionalLabels?: { description: string; className: string }[];
}

interface IChatFileChangesSummaryListWrapper extends IDisposable {
	list: WorkbenchList<IChatFileChangesSummaryItem>;
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
			WorkbenchList<IChatFileChangesSummaryItem>,
			'ChatListRenderer',
			container,
			new CollapsibleChangesSummaryListDelegate(),
			[this.instantiationService.createInstance(CollapsibleChangesSummaryListRenderer, resourceLabels)],
			{}
		));
		return {
			list: list,
			dispose: () => {
				store.dispose();
			}
		};
	}

	get(): WorkbenchList<IChatFileChangesSummaryItem> {
		return this._resourcePool.get().list;
	}
}

interface ICollapsibleChangesSummaryListTemplate extends IDisposable {
	readonly label: IResourceLabel;
}

class CollapsibleChangesSummaryListDelegate implements IListVirtualDelegate<IChatFileChangesSummaryItem> {

	getHeight(element: IChatFileChangesSummaryItem): number {
		return 22;
	}

	getTemplateId(element: IChatFileChangesSummaryItem): string {
		return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	}
}

class CollapsibleChangesSummaryListRenderer implements IListRenderer<IChatFileChangesSummaryItem, ICollapsibleChangesSummaryListTemplate> {

	static TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer';
	static CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
		return { label, dispose: () => label.dispose() };
	}

	renderElement(data: IChatFileChangesSummaryItem, index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		const label = templateData.label;
		label.setFile(data.reference, {
			fileKind: FileKind.FILE,
			title: data.reference.path
		});
		const labelElement = label.element;
		labelElement.querySelector(`.${CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`)?.remove();
		if (!data.additionalLabels) {
			return;
		}
		const changesSummary = labelElement.appendChild($(`.${CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));
		for (const additionalLabel of data.additionalLabels) {
			const element = changesSummary.appendChild($(`.${additionalLabel.className}`));
			element.textContent = additionalLabel.description;
		}
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.dispose();
	}
}
