/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { autorun, constObservable, IObservable, isObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { IChatMultiDiffData, IChatMultiDiffInnerData } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

interface IChatMultiDiffItem {
	uri: URI;
	diff?: IEditSessionEntryDiff;
}

const ELEMENT_HEIGHT = 22;
const MAX_ITEMS_SHOWN = 6;

export class ChatMultiDiffContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private list!: WorkbenchList<IChatMultiDiffItem>;
	private isCollapsed: boolean = false;
	private readonly readOnly: boolean;
	private readonly diffData: IObservable<IChatMultiDiffInnerData>;

	constructor(
		private readonly content: IChatMultiDiffData,
		_element: ChatTreeItem,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.readOnly = content.readOnly ?? false;
		this.diffData = isObservable(this.content.multiDiffData)
			? this.content.multiDiffData.map(d => d)
			: constObservable(this.content.multiDiffData);

		const headerDomNode = $('.checkpoint-file-changes-summary-header');
		this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;
		this.isCollapsed = content?.collapsed ?? false;

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderFilesList(this.domNode));
	}

	private renderHeader(container: HTMLElement): IDisposable {
		const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
		const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
		this._register(autorun(reader => {
			const fileCount = this.diffData.read(reader).resources.length;
			viewListButton.label = fileCount === 1
				? localize('chatMultiDiff.oneFile', 'Changed 1 file')
				: localize('chatMultiDiff.manyFiles', 'Changed {0} files', fileCount);
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
		if (!this.readOnly) {
			disposables.add(this.renderViewAllFileChangesButton(viewListButton.element));
		}
		disposables.add(this.renderContributedButtons(viewListButton.element));
		return toDisposable(() => disposables.dispose());
	}

	private renderViewAllFileChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild($('.chat-view-changes-icon'));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		button.title = localize('chatMultiDiff.openAllChanges', 'Open Changes');

		return dom.addDisposableListener(button, 'click', (e) => {
			const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
			const { title, resources } = this.diffData.get();
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				source,
				title || 'Multi-Diff',
				resources.map(resource => new MultiDiffEditorItem(
					resource.originalUri,
					resource.modifiedUri,
					resource.goToFileUri
				)),
				false
			);
			const sideBySide = e.altKey;
			this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
			dom.EventHelper.stop(e, true);
		});
	}

	private renderContributedButtons(container: HTMLElement): IDisposable {
		const buttonsContainer = container.appendChild($('.chat-multidiff-contributed-buttons'));
		const disposables = new DisposableStore();
		const actionBar = disposables.add(new ActionBar(buttonsContainer, {
			orientation: ActionsOrientation.HORIZONTAL
		}));
		const setupActionBar = () => {
			actionBar.clear();

			let marshalledUri: unknown | undefined = undefined;
			let contextKeyService: IContextKeyService = this.contextKeyService;
			if (this.editorService.activeEditor instanceof ChatEditorInput) {
				contextKeyService = this.contextKeyService.createOverlay([
					[ChatContextKeys.agentSessionType.key, this.editorService.activeEditor.getSessionType()]
				]);

				marshalledUri = {
					...this.editorService.activeEditor.resource,
					$mid: MarshalledId.Uri
				};
			}

			const actions = this.menuService.getMenuActions(
				MenuId.ChatMultiDiffContext,
				contextKeyService,
				{ arg: marshalledUri, shouldForwardArgs: true }
			);
			const allActions = actions.flatMap(([, actions]) => actions);
			if (allActions.length > 0) {
				actionBar.push(allActions, { icon: true, label: false });
			}
		};
		setupActionBar();
		return disposables;
	}

	private renderFilesList(container: HTMLElement): IDisposable {
		const store = new DisposableStore();

		const listContainer = container.appendChild($('.chat-summary-list'));
		store.add(createFileIconThemableTreeContainerScope(listContainer, this.themeService));
		const resourceLabels = store.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: Event.None }));

		this.list = store.add(this.instantiationService.createInstance(
			WorkbenchList<IChatMultiDiffItem>,
			'ChatMultiDiffList',
			listContainer,
			new ChatMultiDiffListDelegate(),
			[this.instantiationService.createInstance(ChatMultiDiffListRenderer, resourceLabels)],
			{
				identityProvider: {
					getId: (element: IChatMultiDiffItem) => element.uri.toString()
				},
				setRowLineHeight: true,
				horizontalScrolling: false,
				supportDynamicHeights: false,
				mouseSupport: !this.readOnly,
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IChatMultiDiffItem) => element.uri.path,
					getWidgetAriaLabel: () => localize('chatMultiDiffList', "File Changes")
				}
			}
		));

		this._register(autorun(reader => {
			const { resources } = this.diffData.read(reader);

			const items: IChatMultiDiffItem[] = [];
			for (const resource of resources) {
				const uri = resource.modifiedUri || resource.originalUri || resource.goToFileUri;
				if (!uri) {
					continue;
				}

				const item: IChatMultiDiffItem = { uri };

				if (resource.originalUri && resource.modifiedUri) {
					item.diff = {
						originalURI: resource.originalUri,
						modifiedURI: resource.modifiedUri,
						isFinal: true,
						quitEarly: false,
						identical: false,
						added: resource.added || 0,
						removed: resource.removed || 0,
						isBusy: false,
					};
				}
				items.push(item);
			}

			this.list.splice(0, this.list.length, items);

			const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
			this.list.layout(height);
			listContainer.style.height = `${height}px`;
			this._onDidChangeHeight.fire();
		}));


		if (!this.readOnly) {
			store.add(this.list.onDidOpen((e) => {
				if (!e.element) {
					return;
				}

				if (e.element.diff) {
					this.editorService.openEditor({
						original: { resource: e.element.diff.originalURI },
						modified: { resource: e.element.diff.modifiedURI },
						options: { preserveFocus: true }
					});
				} else {
					this.editorService.openEditor({
						resource: e.element.uri,
						options: { preserveFocus: true }
					});
				}
			}));
		}

		return store;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'multiDiffData' && this.diffData.get().resources.length === (isObservable(other.multiDiffData) ? other.multiDiffData.get().resources.length : other.multiDiffData.resources.length);
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatMultiDiffListDelegate implements IListVirtualDelegate<IChatMultiDiffItem> {
	getHeight(): number {
		return 22;
	}

	getTemplateId(): string {
		return 'chatMultiDiffItem';
	}
}

interface IChatMultiDiffItemTemplate extends IDisposable {
	readonly label: IResourceLabel;
}

class ChatMultiDiffListRenderer implements IListRenderer<IChatMultiDiffItem, IChatMultiDiffItemTemplate> {
	static readonly TEMPLATE_ID = 'chatMultiDiffItem';
	static readonly CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = ChatMultiDiffListRenderer.TEMPLATE_ID;

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IChatMultiDiffItemTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });

		return {
			label,
			dispose: () => label.dispose()
		};
	}

	renderElement(element: IChatMultiDiffItem, _index: number, templateData: IChatMultiDiffItemTemplate): void {
		templateData.label.setFile(element.uri, {
			fileKind: FileKind.FILE,
			title: element.uri.path
		});

		const labelElement = templateData.label.element;
		// eslint-disable-next-line no-restricted-syntax
		labelElement.querySelector(`.${ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME}`)?.remove();

		if (element.diff?.added || element.diff?.removed) {
			const changesSummary = labelElement.appendChild($(`.${ChatMultiDiffListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));

			const addedElement = changesSummary.appendChild($('.insertions'));
			addedElement.textContent = `+${element.diff.added}`;

			const removedElement = changesSummary.appendChild($('.deletions'));
			removedElement.textContent = `-${element.diff.removed}`;

			changesSummary.setAttribute('aria-label', localize('chatEditingSession.fileCounts', '{0} lines added, {1} lines removed', element.diff.added, element.diff.removed));
		}
	}

	disposeTemplate(templateData: IChatMultiDiffItemTemplate): void {
		templateData.dispose();
	}
}
