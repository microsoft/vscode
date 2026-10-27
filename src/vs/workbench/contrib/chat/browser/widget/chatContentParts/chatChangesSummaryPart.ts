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
import { autorun, IObservable, IReaderWithStore } from '../../../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { FileKind } from '../../../../../../platform/files/common/files.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../../browser/labels.js';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { IChatEditingSession, IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { ChatEditingSnapshotTextModelContentProvider } from '../../chatEditing/chatEditingTextModelContentProviders.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatChangesSummaryPart as IChatFileChangesSummaryPart, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { openChatFileChanges, toChatFileChangeEditorResource } from '../../editorChatResponseFileChangesService.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ChatTreeItem } from '../../chat.js';
import { ResourcePool } from './chatCollections.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';

const CHANGES_SUMMARY_ELEMENT_HEIGHT = 22;
const CHANGES_SUMMARY_MAX_ITEMS_SHOWN = 6;

export function getChatFileChangeLineCounts(added: number, removed: number): string {
	const additions = added === 1
		? localize('chat.fileChanges.oneLineAdded', "1 line added")
		: localize('chat.fileChanges.linesAdded', "{0} lines added", added);
	const deletions = removed === 1
		? localize('chat.fileChanges.oneLineRemoved', "1 line removed")
		: localize('chat.fileChanges.linesRemoved', "{0} lines removed", removed);
	return localize('chat.fileChanges.lineCounts', "{0}, {1}", additions, deletions);
}

/** Options controlling how {@link renderChangesSummaryFileList} renders each row. */
export interface IChangesSummaryFileListOptions {
	/** Overrides how activating a row opens its file. */
	readonly openEditor?: (diff: IEditSessionEntryDiff, inDiffEditor: boolean, options: IEditorOptions, sideBySide: boolean) => void;
	readonly ariaLabel?: string;
	/**
	 * Provides the actions shown in a per-row action bar (right-aligned). Return
	 * an empty array for rows that should have no actions. When omitted, no action
	 * bar is rendered. The actions are provided again when observables read with
	 * `reader` change, and disposables added to its store live until then or until
	 * the row is rendered again.
	 */
	readonly getRowActions?: (diff: IEditSessionEntryDiff, reader: IReaderWithStore) => IAction[];
	/**
	 * Shows the row actions as icons after the change counts, revealed while the
	 * row is hovered, focused, or selected, instead of as links before the counts.
	 */
	readonly rowActionIcons?: boolean;
}

/** A list rendered by {@link renderChangesSummaryFileList}. */
export interface IChangesSummaryFileList extends IDisposable {
	/** The changes of the selected rows. */
	getSelectedElements(): readonly IEditSessionEntryDiff[];
}

/**
 * Opens the diff of a file's change, or the multi-diff editor with the absent
 * side empty when the change created or deleted the file.
 */
export function openChatFileChangeDiff(editorService: IEditorService, diff: IEditSessionEntryDiff, options?: IEditorOptions, sideBySide = false): void {
	const editorResource = toChatFileChangeEditorResource(diff);
	if (!editorResource.original.resource || !editorResource.modified.resource) {
		openChatFileChanges(editorService, localize('chat.fileChanges', "File Changes"), [diff], sideBySide, options);
		return;
	}
	editorService.openEditor({
		original: editorResource.original,
		modified: editorResource.modified,
		options,
	}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
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
): IChangesSummaryFileList {
	const store = new DisposableStore();
	const columnWidths: IChangesSummaryColumnWidths = { insertions: 2, deletions: 2 };
	const { list, renderer } = store.add(instantiationService.createInstance(CollapsibleChangesSummaryListPool, options, columnWidths)).get();
	const listNode = list.getHTMLElement();
	const listContainer = listNode.parentElement!;
	container.appendChild(listContainer);

	store.add(list.onDidOpen((item) => {
		const diff = item.element;
		if (!diff) {
			return;
		}

		const altKey = (dom.isMouseEvent(item.browserEvent) || dom.isKeyboardEvent(item.browserEvent)) && item.browserEvent.altKey;
		const openInDiffEditorByDefault = configurationService.getValue<boolean>(ChatConfiguration.OpenChangedFileInDiffEditor);
		const openInDiffEditor = diff.isDeleted || (altKey ? !openInDiffEditorByDefault : openInDiffEditorByDefault);

		if (options?.openEditor) {
			options.openEditor(diff, openInDiffEditor, item.editorOptions, item.sideBySide);
			return;
		}

		if (!openInDiffEditor) {
			const fileURI = ChatEditingSnapshotTextModelContentProvider.getOriginalFileURI(diff.modifiedURI);
			if (fileURI) {
				editorService.openEditor({ resource: fileURI, options: { preserveFocus: true } });
				return;
			}
			// The file's origin cannot be recovered (e.g. legacy snapshot URIs):
			// fall back to the diff editor.
		}

		openChatFileChangeDiff(editorService, diff, { preserveFocus: true });
	}));

	store.add(list.onContextMenu(e => {
		dom.EventHelper.stop(e.browserEvent, true);
	}));

	store.add(autorun((r) => {
		const currentDiffs = diffs.read(r);
		// Laying out and rebuilding the rows removes whatever had keyboard focus in them, so focus returns to the same file afterwards.
		const hadFocus = !!options?.getRowActions && dom.isAncestorOfActiveElement(listNode);
		const focusedAction = hadFocus ? renderer.getFocusedRowAction() : undefined;
		const focusedIndex = focusedAction ? list.indexOf(focusedAction.diff) : list.getFocus().at(0);
		let insertionsColumnCharacters = 2;
		let deletionsColumnCharacters = 2;
		// Widths are shared by the list so each row uses the same count columns.
		for (const diff of currentDiffs) {
			if (!diff.identical && !diff.isBusy) {
				insertionsColumnCharacters = Math.max(insertionsColumnCharacters, String(diff.added).length + 1);
				deletionsColumnCharacters = Math.max(deletionsColumnCharacters, String(diff.removed).length + 1);
			}
		}
		columnWidths.insertions = insertionsColumnCharacters;
		columnWidths.deletions = deletionsColumnCharacters;

		const itemsShown = Math.min(currentDiffs.length, CHANGES_SUMMARY_MAX_ITEMS_SHOWN);
		listContainer.classList.toggle('overflowing', currentDiffs.length > itemsShown);
		const height = itemsShown * CHANGES_SUMMARY_ELEMENT_HEIGHT;
		list.layout(height);
		listNode.style.height = height + 'px';

		list.splice(0, list.length, currentDiffs);
		if (hadFocus) {
			const sameFile = focusedAction && currentDiffs.find(diff => isEqual(diff.modifiedURI, focusedAction.diff.modifiedURI));
			if (sameFile) {
				// Its actions only show in the focused row, which an insertion may have moved out of view.
				const index = list.indexOf(sameFile);
				list.setFocus([index]);
				list.reveal(index);
			} else if (focusedIndex !== undefined && focusedIndex >= 0 && list.getFocus().length === 0 && list.length > 0) {
				// When the focused file leaves the list, keyboard focus moves to the file taking its place.
				const index = Math.min(focusedIndex, list.length - 1);
				list.setFocus([index]);
				list.reveal(index);
			}
			if (!dom.isAncestorOfActiveElement(listNode) && !(sameFile && focusedAction && renderer.focusRowAction(sameFile, focusedAction.index))) {
				list.domFocus();
			}
		}
	}));

	return {
		getSelectedElements: () => list.getSelectedElements(),
		dispose: () => store.dispose(),
	};
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
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRightCompact));

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
	renderer: CollapsibleChangesSummaryListRenderer;
}

interface IChangesSummaryColumnWidths {
	insertions: number;
	deletions: number;
}

class CollapsibleChangesSummaryListPool extends Disposable {

	private _resourcePool: ResourcePool<IChatFileChangesSummaryListWrapper>;

	constructor(
		private readonly options: IChangesSummaryFileListOptions | undefined,
		private readonly columnWidths: IChangesSummaryColumnWidths,
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
		const renderer = new CollapsibleChangesSummaryListRenderer(resourceLabels, this.options, this.columnWidths);
		const list = store.add(this.instantiationService.createInstance(
			WorkbenchList<IEditSessionEntryDiff>,
			'ChatListRenderer',
			container,
			new CollapsibleChangesSummaryListDelegate(),
			[renderer],
			{
				alwaysConsumeMouseWheel: false,
				identityProvider: { getId: diff => getComparisonKey(diff.modifiedURI) },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: diff => diff.modifiedURI.path },
				accessibilityProvider: {
					getWidgetAriaLabel: () => this.options?.ariaLabel ?? localize('chat.fileChanges.list', "Changed files"),
					getAriaLabel: diff => {
						const lineCounts = getChatFileChangeLineCounts(diff.added, diff.removed);
						return diff.isDeleted
							? localize('chat.fileChanges.deletedFile', "{0}, deleted, {1}", diff.modifiedURI.path, lineCounts)
							: diff.isCreated
								? localize('chat.fileChanges.createdFile', "{0}, added, {1}", diff.modifiedURI.path, lineCounts)
								: localize('chat.fileChanges.modifiedFile', "{0}, {1}", diff.modifiedURI.path, lineCounts);
					},
				},
			}
		));
		return {
			list: list,
			renderer,
			dispose: () => {
				store.dispose();
			}
		};
	}

	get(): IChatFileChangesSummaryListWrapper {
		return this._resourcePool.get();
	}
}

interface ICollapsibleChangesSummaryListTemplate extends IDisposable {
	readonly label: IResourceLabel;
	/** Where the row's actions render, when the list has row actions. */
	readonly actionsContainer?: HTMLElement;
	/** The actions of the rendered element. */
	actionBar?: ActionBar;
	readonly changesContainer: HTMLElement;
	/** The element the change counts are inserted before, or `null` to append them. */
	readonly changesAnchor: HTMLElement | null;
	readonly elementDisposables: DisposableStore;
	changesElement?: HTMLElement;
	/** The element the row renders. */
	element?: IEditSessionEntryDiff;
}

class CollapsibleChangesSummaryListDelegate implements IListVirtualDelegate<IEditSessionEntryDiff> {

	getHeight(element: IEditSessionEntryDiff): number {
		return CHANGES_SUMMARY_ELEMENT_HEIGHT;
	}

	getTemplateId(element: IEditSessionEntryDiff): string {
		return CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;
	}
}

/** The index of the action with keyboard focus in `actionBar`, if any. */
function getFocusedActionIndex(actionBar: ActionBar): number | undefined {
	if (actionBar.isFocused()) {
		for (let index = 0; index < actionBar.length(); index++) {
			if (actionBar.isFocused(index)) {
				return index;
			}
		}
	}
	return undefined;
}

class CollapsibleChangesSummaryListRenderer implements IListRenderer<IEditSessionEntryDiff, ICollapsibleChangesSummaryListTemplate> {

	static TEMPLATE_ID = 'collapsibleChangesSummaryListRenderer';
	static CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = CollapsibleChangesSummaryListRenderer.TEMPLATE_ID;

	/** The templates of rows with actions, for moving keyboard focus within rows. */
	private readonly _templatesWithActions = new Set<ICollapsibleChangesSummaryListTemplate>();

	constructor(
		private labels: ResourceLabels,
		private readonly options: IChangesSummaryFileListOptions | undefined,
		private readonly columnWidths: IChangesSummaryColumnWidths,
	) { }

	/** The element and index of the row action with keyboard focus, if any. */
	getFocusedRowAction(): { readonly diff: IEditSessionEntryDiff; readonly index: number } | undefined {
		for (const { element, actionBar } of this._templatesWithActions) {
			const index = actionBar && getFocusedActionIndex(actionBar);
			if (element && index !== undefined) {
				return { diff: element, index };
			}
		}
		return undefined;
	}

	/** Moves keyboard focus to the action at `index`, or the last one, in the row of `diff`, returning whether it did. */
	focusRowAction(diff: IEditSessionEntryDiff, index: number): boolean {
		const actionBar = Iterable.find(this._templatesWithActions, template => template.element === diff)?.actionBar;
		if (!actionBar || actionBar.isEmpty()) {
			return false;
		}
		actionBar.focus(Math.min(index, actionBar.length() - 1));
		return actionBar.isFocused();
	}

	renderTemplate(container: HTMLElement): ICollapsibleChangesSummaryListTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });
		const elementDisposables = new DisposableStore();
		let actionsContainer: HTMLElement | undefined;
		let changesContainer = label.element;
		let changesAnchor: HTMLElement | null = null;
		if (this.options?.getRowActions) {
			if (this.options.rowActionIcons) {
				// Like the editing session's working set, icons follow the change counts.
				actionsContainer = changesAnchor = label.element.appendChild($('.chat-summary-list-icon-actions'));
			} else {
				// Links sit between the file label and the trailing change counts.
				container.classList.add('chat-summary-list-row-with-actions');
				actionsContainer = container.appendChild($('.chat-summary-list-actions'));
				changesContainer = container;
			}
		}
		const template: ICollapsibleChangesSummaryListTemplate = {
			label,
			actionsContainer,
			changesContainer,
			changesAnchor,
			elementDisposables,
			dispose: () => {
				label.dispose();
				elementDisposables.dispose();
			}
		};
		if (actionsContainer) {
			this._templatesWithActions.add(template);
		}
		return template;
	}

	renderElement(data: IEditSessionEntryDiff, index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.elementDisposables.clear();
		templateData.element = data;
		const label = templateData.label;
		label.setFile(data.modifiedURI, {
			fileKind: FileKind.FILE,
			title: data.modifiedURI.path
		});

		templateData.changesElement?.remove();

		if (!data.identical && !data.isBusy) {
			const changesSummary = templateData.changesContainer.insertBefore($(`.${CollapsibleChangesSummaryListRenderer.CHANGES_SUMMARY_CLASS_NAME}`), templateData.changesAnchor);

			const added = changesSummary.appendChild($(`.insertions`));
			added.textContent = `+${data.added}`;
			added.style.width = `${this.columnWidths.insertions}ch`;

			const removed = changesSummary.appendChild($(`.deletions`));
			removed.textContent = `-${data.removed}`;
			removed.style.width = `${this.columnWidths.deletions}ch`;

			templateData.changesElement = changesSummary;
		}

		const { actionsContainer } = templateData;
		const getRowActions = this.options?.getRowActions;
		if (actionsContainer && getRowActions) {
			// An action bar restores its focused action after it's cleared, so each element gets its own:
			// a row reused for another file must not move keyboard focus to that file's actions.
			const actionBar = templateData.actionBar = templateData.elementDisposables.add(new ActionBar(actionsContainer));
			const icons = !!this.options?.rowActionIcons;
			templateData.elementDisposables.add(autorun(reader => {
				const actions = getRowActions(data, reader);
				// Rebuilding the actions removes the one with keyboard focus, so focus returns to the same action afterwards.
				const focusedIndex = getFocusedActionIndex(actionBar);
				const focusedId = focusedIndex !== undefined ? actionBar.getAction(focusedIndex)?.id : undefined;
				actionBar.clear();
				actionBar.push(actions, { icon: icons, label: !icons });
				if (focusedIndex !== undefined && !actionBar.isEmpty()) {
					const index = actions.findIndex(action => action.id === focusedId);
					actionBar.focus(index >= 0 ? index : Math.min(focusedIndex, actionBar.length() - 1));
				}
			}));
		}
	}

	disposeElement(_data: IEditSessionEntryDiff, _index: number, templateData: ICollapsibleChangesSummaryListTemplate): void {
		templateData.element = undefined;
		templateData.actionBar = undefined;
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: ICollapsibleChangesSummaryListTemplate): void {
		this._templatesWithActions.delete(templateData);
		templateData.dispose();
	}
}
