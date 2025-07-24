/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatChangesSummaryPart, IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatChangesSummary, IChatService } from '../../common/chatService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ResourcePool } from './chatCollections.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { autorun } from '../../../../../base/common/observable.js';

export class ChatChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly ELEMENT_HEIGHT = 22;
	public readonly MAX_ITEMS_SHOWN = 6;

	public readonly domNode: HTMLElement;

	private fileDiffs: Map<string, IEditSessionEntryDiff> = new Map();
	private changes: readonly IChatChangesSummary[] = [];
	private isExpanded: boolean = false;

	constructor(
		content: IChatChangesSummaryPart,
		private readonly context: IChatContentPartRenderContext,
		@ICommandService private readonly commandService: ICommandService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.changes = content.changes;
		this.computeFileDiffs(content.changes);

		const innerDomNode = $('.container-file-changes-summary');
		this.domNode = $('.chat-file-changes-summary', undefined, innerDomNode);
		this.domNode.tabIndex = 0;

		this._register(this.renderButtons(innerDomNode));
		this._register(this.renderList(this.domNode));
	}

	private computeFileDiffs(changes: readonly IChatChangesSummary[]): void {
		autorun((r) => {
			for (const change of changes) {
				const sessionId = change.sessionId;
				const session = this.chatService.getSession(sessionId);
				if (!session || !session.editingSessionObs) {
					return;
				}
				const editSession = session.editingSessionObs.promiseResult.read(r)?.data;
				if (!editSession) {
					return;
				}
				const uri = change.reference;
				const modifiedEntry = editSession.getEntry(uri);
				if (!modifiedEntry) {
					return;
				}
				const id = this.changeID(change);
				const requestId = change.requestId;
				const undoStops = this.context.content.filter(e => e.kind === 'undoStop');

				let madeChange = false;
				for (let i = undoStops.length - 1; i >= 0; i--) {
					const undoStopID = undoStops[i].id;
					const diff: IEditSessionEntryDiff | undefined = editSession.getEntryDiffBetweenStops(modifiedEntry.modifiedURI, requestId, undoStopID)?.read(r);
					if (!diff) {
						continue;
					}
					this.fileDiffs.set(id, diff);
					madeChange = true;
				}
				if (!madeChange) {
					this.fileDiffs.delete(id);
				}
			}
		});
	}

	private changeID(change: IChatChangesSummary): string {
		return `${change.sessionId}-${change.requestId}-${change.reference.path}`;
	}

	private renderButtons(container: HTMLElement): IDisposable {
		const viewListButtonContainer = container.appendChild($('.chat-used-context-label'));
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
		if (this.changes.length === 1) {
			viewListButton.label = `Changed 1 file`;
		} else {
			viewListButton.label = `Changed ${this.changes.length} files`;
		}

		const setExpansionState = () => {
			viewListButton.icon = this.isExpanded ? Codicon.chevronDown : Codicon.chevronRight;
			this.domNode.classList.toggle('chat-used-context-collapsed', !this.isExpanded);
		};
		setExpansionState();

		const disposables = new DisposableStore();
		disposables.add(viewListButton.onDidClick(() => {
			this.isExpanded = !this.isExpanded;
			setExpansionState();
		}));
		disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));

		return toDisposable(() => disposables.dispose());
	}

	private renderList(container: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const listpool = store.add(this.instantiationService.createInstance(CollapsibleChangesSummaryListPool));
		const list = listpool.get();
		const listElement = list.getHTMLElement();
		const itemsShown = Math.min(this.changes.length, this.MAX_ITEMS_SHOWN);
		const height = itemsShown * this.ELEMENT_HEIGHT;
		listElement.style.height = `${height}px`;
		list.layout(height);
		list.splice(0, list.length, this.computeChangeSummaryItems(this.changes));
		container.appendChild(listElement.parentElement!);

		store.add(list.onDidOpen((item) => {
			if (!item.element) {
				return;
			}
			const changeID = this.changeID(item.element);
			const diff = this.fileDiffs.get(changeID);
			if (diff) {
				const input = {
					original: { resource: diff.originalURI },
					modified: { resource: diff.modifiedURI },
					options: { transient: true },
				};
				return this.editorService.openEditor(input);
			} else {
				return this.editorService.openEditor({ resource: item.element.reference });
			}
		}));
		store.add(list.onContextMenu(e => {
			dom.EventHelper.stop(e.browserEvent, true);
		}));
		return store;
	}

	private renderViewAllFileChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild($('.chat-view-changes-icon'));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		return dom.addDisposableListener(button, 'click', (e) => {
			const resources: { originalUri: URI; modifiedUri?: URI }[] = [];
			this.changes.forEach(e => {
				const changeID = this.changeID(e);
				const diffEntry = this.fileDiffs.get(changeID);
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
			this.commandService.executeCommand('chatEditing.viewFileChangesSummary', resources);
			dom.EventHelper.stop(e, true);
		});
	}

	private computeChangeSummaryItems(changes: readonly IChatChangesSummary[]): IChatChangesSummaryItem[] {
		const items: IChatChangesSummaryItem[] = [];
		for (const change of changes) {
			const changeID = this.changeID(change);
			const diffEntry = this.fileDiffs.get(changeID);
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
				const changeWithInsertionsAndDeletions: IChatChangesSummaryItem = {
					...change,
					additionalLabels
				};
				items.push(changeWithInsertionsAndDeletions);
			} else {
				items.push(change);
			}
		}
		return items;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'changesSummary' && other.changes.length === this.changes.length;
	}
}

export interface IChatChangesSummaryItem extends IChatChangesSummary {
	additionalLabels?: { description: string; className: string }[];
}

export class CollapsibleChangesSummaryListPool extends Disposable {

	private _pool: ResourcePool<WorkbenchList<IChatChangesSummaryItem>>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
		this._pool = this._register(new ResourcePool(() => this.listFactory()));
	}

	private listFactory(): WorkbenchList<IChatChangesSummaryItem> {
		const resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: () => Disposable.None }));
		const container = $('.chat-used-context-list');
		this._register(createFileIconThemableTreeContainerScope(container, this.themeService));
		const list = this.instantiationService.createInstance(
			WorkbenchList<IChatChangesSummaryItem>,
			'ChatListRenderer',
			container,
			new CollapsibleListDelegate(),
			[this.instantiationService.createInstance(CollapsibleChangesSummaryListRenderer, resourceLabels)],
			{ alwaysConsumeMouseWheel: false });
		return list;
	}

	get(): WorkbenchList<IChatChangesSummaryItem> {
		return this._pool.get();
	}
}

interface ICollapsibleChangesSummaryListTemplate {
	readonly label: IResourceLabel;
	readonly disposables: DisposableStore;
}

class CollapsibleListDelegate implements IListVirtualDelegate<IChatChangesSummaryItem> {

	getHeight(element: IChatChangesSummaryItem): number {
		return 22;
	}

	getTemplateId(element: IChatChangesSummaryItem): string {
		return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	}
}

class CollapsibleChangesSummaryListRenderer implements IListRenderer<IChatChangesSummaryItem, ICollapsibleChangesSummaryListTemplate> {

	static TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer';

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels
	) { }

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const disposables = new DisposableStore();
		const label = disposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
		return { disposables, label };
	}

	renderElement(data: IChatChangesSummaryItem, index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		const label = templateData.label;
		label.element.style.display = 'flex';
		label.setFile(data.reference, {
			fileKind: FileKind.FILE,
			title: data.reference.path
		});
		data.additionalLabels?.forEach(additionalLabel => {
			const element = label.element.appendChild($(`.${additionalLabel.className}`));
			element.textContent = additionalLabel.description;
		});
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.disposables.dispose();
	}
}
