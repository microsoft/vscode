/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ButtonWithIcon } from '../../../../../base/browser/ui/button/button.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContentPart } from './chatContentParts.js';
import { IChatMultiDiffData } from '../../common/chatService.js';
import { ChatTreeItem } from '../chat.js';
import { IResourceLabel, ResourceLabels } from '../../../../browser/labels.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { createFileIconThemableTreeContainerScope } from '../../../files/browser/views/explorerView.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditSessionEntryDiff } from '../../common/chatEditingService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ActionBar, ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

const $ = dom.$;

type ChatMultiDiffApplyEvent = {
	fileCount: number;
	success: boolean;
	errorCode?: string;
};

type ChatMultiDiffApplyClassification = {
	fileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files to apply changes to.' };
	success: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the apply operation succeeded.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Error code if apply operation failed.' };
	owner: 'microsoft';
	comment: 'Tracks usage of the chat multi-diff apply changes button.';
};

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
	private isCollapsed: boolean = true;

	constructor(
		private readonly content: IChatMultiDiffData,
		_element: ChatTreeItem,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IThemeService private readonly themeService: IThemeService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super();

		const headerDomNode = $('.checkpoint-file-changes-summary-header');
		this.domNode = $('.checkpoint-file-changes-summary', undefined, headerDomNode);
		this.domNode.tabIndex = 0;

		this._register(this.renderHeader(headerDomNode));
		this._register(this.renderFilesList(this.domNode));
	}

	private renderHeader(container: HTMLElement): IDisposable {
		const fileCount = this.content.multiDiffData.resources.length;

		const viewListButtonContainer = container.appendChild($('.chat-file-changes-label'));
		const viewListButton = new ButtonWithIcon(viewListButtonContainer, {});
		viewListButton.label = fileCount === 1
			? localize('chatMultiDiff.oneFile', 'Changed 1 file')
			: localize('chatMultiDiff.manyFiles', 'Changed {0} files', fileCount);

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
		disposables.add(this.renderApplyChangesButton(viewListButton.element));
		disposables.add(this.renderContributedButtons(viewListButton.element));
		return toDisposable(() => disposables.dispose());
	}

	private renderViewAllFileChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild($('.chat-view-changes-icon'));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));

		return dom.addDisposableListener(button, 'click', (e) => {
			const source = URI.parse(`multi-diff-editor:${new Date().getMilliseconds().toString() + Math.random().toString()}`);
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				source,
				this.content.multiDiffData.title || 'Multi-Diff',
				this.content.multiDiffData.resources.map(resource => new MultiDiffEditorItem(
					resource.originalUri,
					resource.modifiedUri,
					resource.goToFileUri
				)),
				false
			);
			this.editorGroupsService.activeGroup.openEditor(input);
			dom.EventHelper.stop(e, true);
		});
	}

	private renderApplyChangesButton(container: HTMLElement): IDisposable {
		const button = container.appendChild($('.chat-apply-changes-icon'));
		button.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		button.setAttribute('title', localize('chatMultiDiff.applyChanges', 'Apply Changes to Workspace'));

		return dom.addDisposableListener(button, 'click', async (e) => {
			dom.EventHelper.stop(e, true);
			
			const startTime = Date.now();
			let fileCount = 0;
			let success = false;
			let errorCode: string | undefined;
			
			try {
				const edits: ResourceTextEdit[] = [];
				
				for (const resource of this.content.multiDiffData.resources) {
					// Skip if no modified URI (e.g., deleted files)
					if (!resource.modifiedUri) {
						continue;
					}
					
					fileCount++;
					
					// Read the modified content
					const modifiedContent = await this.fileService.readFile(resource.modifiedUri);
					const content = modifiedContent.value.toString();
					
					// Determine target URI (prefer goToFileUri, fallback to originalUri)
					const targetUri = resource.goToFileUri || resource.originalUri;
					if (!targetUri) {
						continue;
					}
					
					// Create a text edit that replaces the entire file content
					// Use a range that spans the entire document - this is a common pattern
					const textEdit: TextEdit = {
						range: new Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
						text: content
					};
					
					edits.push(new ResourceTextEdit(targetUri, textEdit));
				}
				
				if (edits.length === 0) {
					this.notificationService.info(localize('chatMultiDiff.noEditsToApply', 'No changes to apply.'));
					errorCode = 'NO_EDITS';
					this.telemetryService.publicLog2<ChatMultiDiffApplyEvent, ChatMultiDiffApplyClassification>('chatMultiDiffApply', {
						fileCount: 0,
						success: false,
						errorCode
					});
					return;
				}
				
				// Apply the edits
				const result = await this.bulkEditService.apply(edits, {
					label: localize('chatMultiDiff.applyChangesLabel', 'Apply Chat Changes'),
					respectAutoSaveConfig: true
				});
				
				success = result.isApplied;
				
				if (result.isApplied) {
					this.notificationService.info(localize('chatMultiDiff.changesApplied', 'Successfully applied {0} file change(s).', edits.length));
				} else {
					this.notificationService.error(localize('chatMultiDiff.changesNotApplied', 'Failed to apply changes.'));
					errorCode = 'BULK_EDIT_FAILED';
				}
				
			} catch (error) {
				success = false;
				errorCode = 'EXCEPTION';
				this.notificationService.error(localize('chatMultiDiff.applyError', 'Error applying changes: {0}', error.message || error));
			} finally {
				// Log telemetry
				this.telemetryService.publicLog2<ChatMultiDiffApplyEvent, ChatMultiDiffApplyClassification>('chatMultiDiffApply', {
					fileCount,
					success,
					errorCode
				});
			}
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

			const activeEditorUri = this.editorService.activeEditor?.resource;
			let marshalledUri: any | undefined = undefined;
			let contextKeyService: IContextKeyService = this.contextKeyService;
			if (activeEditorUri) {
				const { authority } = activeEditorUri;
				const overlay: [string, unknown][] = [];
				if (authority) {
					overlay.push([ChatContextKeys.sessionType.key, authority]);
				}
				contextKeyService = this.contextKeyService.createOverlay(overlay);
				marshalledUri = {
					...activeEditorUri,
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
				mouseSupport: true,
				accessibilityProvider: {
					getAriaLabel: (element: IChatMultiDiffItem) => element.uri.path,
					getWidgetAriaLabel: () => localize('chatMultiDiffList', "File Changes")
				}
			}
		));

		const items: IChatMultiDiffItem[] = [];
		for (const resource of this.content.multiDiffData.resources) {
			const uri = resource.modifiedUri || resource.originalUri || resource.goToFileUri;
			if (!uri) {
				continue;
			}

			const item: IChatMultiDiffItem = { uri };

			if (resource.originalUri && resource.modifiedUri) {
				item.diff = {
					originalURI: resource.originalUri,
					modifiedURI: resource.modifiedUri,
					quitEarly: false,
					identical: false,
					added: 0,
					removed: 0
				};
			}

			items.push(item);
		}

		this.list.splice(0, this.list.length, items);

		const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
		this.list.layout(height);
		listContainer.style.height = `${height}px`;

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

		return store;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'multiDiffData' &&
			(other as any).multiDiffData?.resources?.length === this.content.multiDiffData.resources.length;
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
		return { label, dispose: () => label.dispose() };
	}

	renderElement(element: IChatMultiDiffItem, _index: number, templateData: IChatMultiDiffItemTemplate): void {
		templateData.label.setFile(element.uri, {
			fileKind: FileKind.FILE,
			title: element.uri.path
		});
	}

	disposeTemplate(templateData: IChatMultiDiffItemTemplate): void {
		templateData.dispose();
	}
}
