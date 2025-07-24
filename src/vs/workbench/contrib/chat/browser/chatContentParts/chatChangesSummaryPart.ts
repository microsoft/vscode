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
import { autorun, derived, IObservableWithChange } from '../../../../../base/common/observable.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { Emitter } from '../../../../../base/common/event.js';

export class ChatCheckpointFileChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	public readonly ELEMENT_HEIGHT = 22;
	public readonly MAX_ITEMS_SHOWN = 6;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private fileChanges: readonly IChatFileChangesSummary[];
	private fileChangesDiffsObservable: IObservableWithChange<Map<string, IEditSessionEntryDiff>, void>;

	private list!: WorkbenchList<IChatFileChangesSummaryItem>;
	private isCollapsed: boolean = true;

	constructor(
		content: IChatFileChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.fileChanges = content.fileChanges;
		this.fileChangesDiffsObservable = this.computeFileChangesDiffs(context, content.fileChanges);

		const headerDomNode = $('.checkpoint-file-changes-summary-header');
		this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;

		this._register(this.renderButtons(headerDomNode));
		this._register(this.renderList(this.domNode));

		autorun((r) => {
			this.updateList(this.fileChanges, this.fileChangesDiffsObservable.read(r));
		});
	}

	private changeID(change: IChatFileChangesSummary): string {
		return `${change.sessionId}-${change.requestId}-${change.reference.path}`;
	}

	private computeFileChangesDiffs(context: IChatContentPartRenderContext, changes: readonly IChatFileChangesSummary[]): IObservableWithChange<Map<string, IEditSessionEntryDiff>, void> {
		return derived((r) => {
			const fileChangesDiffs = new Map<string, IEditSessionEntryDiff>();
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
				const uri = change.reference;
				const modifiedEntry = editSession.getEntry(uri);
				if (!modifiedEntry) {
					continue;
				}
				const requestId = change.requestId;
				const undoStops = context.content.filter(e => e.kind === 'undoStop');

				for (let i = undoStops.length - 1; i >= 0; i--) {
					const modifiedUri = modifiedEntry.modifiedURI;
					const undoStopID = undoStops[i].id;
					const diff = editSession.getEntryDiffBetweenStops(modifiedUri, requestId, undoStopID)?.read(r);
					if (!diff) {
						continue;
					}
					fileChangesDiffs.set(this.changeID(change), diff);
				}
			}
			return fileChangesDiffs;
		});
	}

	private renderButtons(container: HTMLElement): IDisposable {
		const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
		const viewListButton = this._register(new ButtonWithIcon(viewListButtonContainer, {
			buttonBackground: undefined,
			buttonBorder: undefined,
			buttonForeground: undefined,
			buttonHoverBackground: undefined,
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSeparator: undefined
		}));
		if (this.fileChanges.length === 1) {
			viewListButton.label = `Changed 1 file`;
		} else {
			viewListButton.label = `Changed ${this.fileChanges.length} files`;
		}

		const setExpansionState = () => {
			viewListButton.icon = this.isCollapsed ? Codicon.chevronRight : Codicon.chevronDown;
			this.domNode.classList.toggle('chat-file-changes-collapsed', this.isCollapsed);
			this._onDidChangeHeight.fire();
		};
		setExpansionState();

		const disposables = new DisposableStore();
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

		return dom.addDisposableListener(button, 'click', (e) => {
			const resources: { originalUri: URI; modifiedUri?: URI }[] = [];
			this.fileChanges.forEach(e => {
				const diffEntry = this.fileChangesDiffsObservable.get().get(this.changeID(e));
				if (diffEntry) {
					resources.push({
						originalUri: diffEntry.originalURI,
						modifiedUri: diffEntry.modifiedURI
					});
				} else {
					resources.push({
						originalUri: e.reference
					});
				}
			});
			const multiDiffSource = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				multiDiffSource,
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
			this.editorGroupsService.activeGroup.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });
			dom.EventHelper.stop(e, true);
		});
	}

	private renderList(container: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const listpool = store.add(this.instantiationService.createInstance(CollapsibleChangesSummaryListPool));
		this.list = listpool.get();
		const listElement = this.list.getHTMLElement();
		const itemsShown = Math.min(this.fileChanges.length, this.MAX_ITEMS_SHOWN);
		const height = itemsShown * this.ELEMENT_HEIGHT;
		listElement.style.height = `${height}px`;
		container.appendChild(listElement.parentElement!);

		this.list.layout(height);
		this.updateList(this.fileChanges, this.fileChangesDiffsObservable.get());

		store.add(this.list.onDidOpen((item) => {
			const element = item.element;
			if (!element) {
				return;
			}
			const diff = this.fileChangesDiffsObservable.get().get(this.changeID(element));
			if (diff) {
				const input = {
					original: { resource: diff.originalURI },
					modified: { resource: diff.modifiedURI },
					options: { transient: true },
				};
				return this.editorService.openEditor(input);
			} else {
				return this.editorService.openEditor({ resource: element.reference });
			}
		}));
		store.add(this.list.onContextMenu(e => {
			dom.EventHelper.stop(e.browserEvent, true);
		}));

		return store;
	}

	private updateList(fileChanges: readonly IChatFileChangesSummary[], fileChangesDiffs: Map<string, IEditSessionEntryDiff>): void {
		this.list.splice(0, this.list.length, this.computeFileChangeSummaryItems(fileChanges, fileChangesDiffs));
	}

	private computeFileChangeSummaryItems(fileChanges: readonly IChatFileChangesSummary[], fileChangesDiffs: Map<string, IEditSessionEntryDiff>): IChatFileChangesSummaryItem[] {
		const items: IChatFileChangesSummaryItem[] = [];
		for (const fileChange of fileChanges) {
			const diffEntry = fileChangesDiffs.get(this.changeID(fileChange));
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

export interface IChatFileChangesSummaryItem extends IChatFileChangesSummary {
	additionalLabels?: { description: string; className: string }[];
}

export class CollapsibleChangesSummaryListPool extends Disposable {

	private _pool: ResourcePool<WorkbenchList<IChatFileChangesSummaryItem>>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatFileChangesSummaryItem> {
		const container = $('.chat-summary-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
		const list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IChatFileChangesSummaryItem>,
			'ChatListRenderer',
			container,
			new CollapsibleChangesSummaryListDelegate(),
			[this.instantiationService.createInstance(CollapsibleChangesSummaryListRenderer, resourceLabels)],
			{ alwaysConsumeMouseWheel: false }));
		return list;
	}

	get(): WorkbenchList<IChatFileChangesSummaryItem> {
		return this._pool.get();
	}
}

interface ICollapsibleChangesSummaryListTemplate {
	readonly label: IResourceLabel;
	readonly disposables: IDisposable;
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

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	readonly insertionAndDeletionsClassName = 'insertions-and-deletions';

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const disposables = new DisposableStore();
		const label = disposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
		return { disposables, label };
	}

	renderElement(data: IChatFileChangesSummaryItem, index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		const label = templateData.label;
		label.setFile(data.reference, {
			fileKind: FileKind.FILE,
			title: data.reference.path
		});
		const labelElement = label.element;
		labelElement.querySelector(`.${this.insertionAndDeletionsClassName}`)?.remove();
		const insertionsAndDeletions = labelElement.appendChild($(`.${this.insertionAndDeletionsClassName}`));
		data.additionalLabels?.forEach(additionalLabel => {
			const element = insertionsAndDeletions.appendChild($(`.${additionalLabel.className}`));
			element.textContent = additionalLabel.description;
		});
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.disposables.dispose();
	}
}
