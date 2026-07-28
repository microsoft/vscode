/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { $ } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../../base/browser/ui/list/list.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChatEditingSession, IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { ChatEditingSnapshotTextModelContentProvider } from '../../chatEditing/chatEditingTextModelContentProviders.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatChangesSummaryPart as IChatFileChangesSummaryPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ChatTreeItem } from '../../chat.js';
import { ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

const CHANGES_SUMMARY_ELEMENT_HEIGHT = 22;
const CHANGES_SUMMARY_MAX_ITEMS_SHOWN = 6;

/** Options controlling how {@link renderChangesSummaryFileList} renders each row. */
export interface IChangesSummaryFileListOptions {
	/**
	 * Provides the actions shown in a per-row action bar (right-aligned). Return
	 * an empty array for rows that should have no actions. When omitted, no action
	 * bar is rendered.
	 */
	readonly getRowActions?: (diff: IEditSessionEntryDiff) => IAction[];
}

/**
 * Renders the collapsible list of changed files (one row per {@link IEditSessionEntryDiff},
 * showing the file's resource label and its +added/-removed counts) into `container`,
 * keeping it in sync with `diffs`. Rows open the file or its diff on activation.
 * Shared by the checkpoint file changes summary and the agent turn changes summary
 * so both render an identical list.
 */
export function renderChangesSummaryFileList(
	container: HTMLElement,
	diffs: IObservable<readonly IEditSessionEntryDiff[]>,
	instantiationService: IInstantiationService,
	editorService: IEditorService,
	configurationService: IConfigurationService,
	options?: IChangesSummaryFileListOptions,
): IDisposable {
	const store = new DisposableStore();
	const list = store.add(instantiationService.createInstance(CollapsibleChangesSummaryListPool, options)).get();
	const listNode = list.getHTMLElement();
	container.appendChild(listNode.parentElement!);

	store.add(list.onDidOpen((item) => {
		const diff = item.element;
		if (!diff) {
			return;
		}

		const altKey = (dom.isMouseEvent(item.browserEvent) || dom.isKeyboardEvent(item.browserEvent)) && item.browserEvent.altKey;
		const openInDiffEditorByDefault = configurationService.getValue<boolean>(ChatConfiguration.OpenChangedFileInDiffEditor);
		const openInDiffEditor = altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault;

		if (!openInDiffEditor) {
			const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(diff.modifiedURI);
			if (fileURI) {
				editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
				return;
			}
			// The file's origin cannot be recovered (e.g. legacy snapshot URIs):
			// fall back to the diff editor.
		}

		editorService.openEditor({
			original: { resource: diff.originalURI },
			modified: { resource: diff.modifiedURI },
			options: { preserveFocus: true }
		});
	}));

	store.add(list.onContextMenu(e => {
		dom.EventHelper.stop(e.browserEvent, true);
	}));

	store.add(autorun((r) => {
		const currentDiffs = diffs.read(r);

		const itemsShown = Math.min(currentDiffs.length, CHANGES_SUMMARY_MAX_ITEMS_SHOWN);
		const height = itemsShown * CHANGES_SUMMARY_ELEMENT_HEIGHT;
		list.layout(height);
		listNode.style.height = height + 'px';

		list.splice(0, list.length, currentDiffs);
	}));

	return store;
}


export class ChatCheckpointFileChangesSummaryContentPart extends Disposable implements IChatContentPart {

	public readonly domNode: HTMLElement;

	private readonly diffsBetweenRequests = new Map<string, IObservable<IEditSessionEntryDiff | undefined>>();

	private fileChangesDiffsObservable: IObservable<readonly IEditSessionEntryDiff[]>;
	private readonly detailsElement: HTMLDetailsElement;

	constructor(
		private readonly content: IChatFileChangesSummaryPart,
		context: IChatContentPartRenderContext,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService private readonly chatService: IChatService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatResponseFileChangesService private readonly chatResponseFileChangesService: IChatResponseFileChangesService,
	) {
		super();

		this.fileChangesDiffsObservable = this.computeFileChangesDiffs(content);

		this.domNode = $('.checkpoint-file-changes-summary.checkpoint-file-changes-compact');
		this.detailsElement = document.createElement('details');
		this.detailsElement.classList.add('checkpoint-file-changes-disclosure');
		this.domNode.appendChild(this.detailsElement);
		const headerDomNode = this.detailsElement.appendChild(document.createElement('summary'));
		headerDomNode.classList.add('checkpoint-file-changes-summary-header');

		// Hide the whole summary when there are no changes to show. The part is
		// created eagerly for completed responses, but session types whose
		// changes are computed asynchronously (e.g. agent host turn changesets)
		// only know whether a turn produced edits once the diffs resolve.
		this._register(autorun(r => {
			const hasChanges = this.fileChangesDiffsObservable.read(r).length > 0;
			this.domNode.style.display = hasChanges ? '' : 'none';
		}));

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderFilesList(this.detailsElement));
		this._register(dom.addDisposableListener(headerDomNode, 'click', () => {
			this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
		}));
	}

	private computeFileChangesDiffs({ requestId, sessionResource }: IChatFileChangesSummaryPart) {
		// Prefer a session-type-specific provider (the authoritative source for
		// session types that own their own change computation); otherwise fall
		// back to the chat editing session's per-request diffs.
		const fromProvider = this.chatResponseFileChangesService.getChangesForRequest(sessionResource, requestId);
		if (fromProvider) {
			return fromProvider;
		}
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
		const filesLabel = container.appendChild($('span.chat-file-changes-label'));
		const counts = container.appendChild($('span.chat-file-changes-counts', { 'aria-hidden': 'true' }));
		const addedLabel = counts.appendChild($('span.insertions'));
		const removedLabel = counts.appendChild($('span.deletions'));
		const disposables = new DisposableStore();
		disposables.add(this.renderViewAllFileChangesButton(container));
		const chevron = container.appendChild($('span.chat-file-changes-chevron.chat-collapsible-hover-chevron', { 'aria-hidden': 'true' }));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));

		this._register(autorun(r => {
			const diffs = this.fileChangesDiffsObservable.read(r);
			const fileCountLabel = diffs.length === 1
				? localize('chat.fileChanges.oneFile', '1 file changed')
				: localize('chat.fileChanges.manyFiles', '{0} files changed', diffs.length);
			const additions = diffs.reduce((total, diff) => total + diff.added, 0);
			const deletions = diffs.reduce((total, diff) => total + diff.removed, 0);
			filesLabel.textContent = fileCountLabel;
			addedLabel.textContent = `+${additions}`;
			removedLabel.textContent = `-${deletions}`;
			container.setAttribute('aria-label', localize(
				'chat.fileChanges.accessibleSummary',
				'{0}, {1} lines added, {2} lines deleted',
				fileCountLabel,
				additions,
				deletions
			));
		}));

		const setExpansionState = () => {
			container.setAttribute('aria-expanded', String(this.detailsElement.open));
			chevron.classList.toggle('expanded', this.detailsElement.open);
		};
		setExpansionState();

		disposables.add(dom.addDisposableListener(this.detailsElement, 'toggle', setExpansionState));
		return toDisposable(() => disposables.dispose());
	}

	private renderViewAllFileChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild(document.createElement('button'));
		button.classList.add('chat-view-changes-icon');
		button.type = 'button';
		const hoverDisposable = this.hoverService.setupDelayedHover(button, () => ({
			content: localize2('chat.viewFileChangesSummary', 'View All File Changes')
		}));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		button.setAttribute('aria-label', localize('chat.viewFileChangesSummary', 'View All File Changes'));

		return combinedDisposable(hoverDisposable, dom.addDisposableListener(button, 'click', (e) => {
			const resources: { originalUri: URI; modifiedUri?: URI }[] = this.fileChangesDiffsObservable.get().map(diff => ({
				originalUri: diff.originalURI,
				modifiedUri: diff.modifiedURI
			}));

			const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				source,
				localize('chat.checkpointFileChanges', 'Checkpoint File Changes'),
				resources.map(resource => {
					return new MultiDiffEditorItem(
						resource.originalUri,
						resource.modifiedUri,
						undefined,
					);
				}),
				false
			);
			this.editorService.openEditor(input);
			dom.EventHelper.stop(e, true);
		}));
	}

	private renderFilesList(container: HTMLElement): IDisposable {
		return renderChangesSummaryFileList(container, this.fileChangesDiffsObservable, this.instantiationService, this.editorService, this.configurationService);
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
		private readonly options: IChangesSummaryFileListOptions | undefined,
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
			[new CollapsibleChangesSummaryListRenderer(resourceLabels, this.options)],
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
	readonly actionBar?: ActionBar;
	changesElement?: HTMLElement;
}

class CollapsibleChangesSummaryListDelegate implements IListVirtualDelegate<IEditSessionEntryDiff> {

	getHeight(element: IEditSessionEntryDiff): number {
		return CHANGES_SUMMARY_ELEMENT_HEIGHT;
	}

	getTemplateId(element: IEditSessionEntryDiff): string {
		return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	}
}

class CollapsibleChangesSummaryListRenderer implements IListRenderer<IEditSessionEntryDiff, ICollapsibleChangesSummaryListTemplate> {

	static TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer';
	static CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		private readonly options?: IChangesSummaryFileListOptions,
	) { }

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
		// Only when a row-action provider is supplied do we add a right-aligned
		// action bar; the row becomes a flex row so the label fills the remaining
		// width and the actions hug the right edge.
		let actionBar: ActionBar | undefined;
		if (this.options?.getRowActions) {
			container.classList.add('chat-summary-list-row-with-actions');
			const actionsContainer = container.appendChild($('.chat-summary-list-actions'));
			actionBar = new ActionBar(actionsContainer);
		}
		return {
			label,
			actionBar,
			dispose: () => {
				label.dispose();
				actionBar?.dispose();
			}
		};
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

		if (templateData.actionBar && this.options?.getRowActions) {
			templateData.actionBar.clear();
			templateData.actionBar.push(this.options.getRowActions(data), { icon: false, label: true });
		}
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.dispose();
	}
}
