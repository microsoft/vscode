/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionFilesWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toAction } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionFile, SessionFileOperation } from '../../../services/sessions/common/session.js';

const $ = dom.$;

/** Minimal input contract for {@link SessionFilesWidget.setInput}. */
export interface ISessionFilesInput {
	readonly sessionFilesObs: IObservable<readonly ISessionFile[]>;
}

class SessionFileListDelegate implements IListVirtualDelegate<ISessionFile> {
	static readonly ITEM_HEIGHT = 22;

	getHeight(_element: ISessionFile): number {
		return SessionFileListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(_element: ISessionFile): string {
		return SessionFileListRenderer.TEMPLATE_ID;
	}
}

interface ISessionFileTemplateData {
	readonly label: IResourceLabel;
	readonly toolbar: WorkbenchToolBar;
	readonly templateDisposables: DisposableStore;
}

class SessionFileListRenderer implements IListRenderer<ISessionFile, ISessionFileTemplateData> {
	static readonly TEMPLATE_ID = 'sessionFile';
	readonly templateId = SessionFileListRenderer.TEMPLATE_ID;

	constructor(
		private readonly _labels: ResourceLabels,
		private readonly _onOpenFile: (file: ISessionFile) => void,
		@ILabelService private readonly _labelService: ILabelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): ISessionFileTemplateData {
		const templateDisposables = new DisposableStore();
		const row = dom.append(container, $('.session-files-widget-file'));
		const label = templateDisposables.add(this._labels.create(row));

		const actionBarContainer = $('.chat-collapsible-list-action-bar');
		const toolbar = templateDisposables.add(this._instantiationService.createInstance(WorkbenchToolBar, actionBarContainer, undefined));
		label.element.appendChild(actionBarContainer);

		return { label, toolbar, templateDisposables };
	}

	renderElement(element: ISessionFile, _index: number, templateData: ISessionFileTemplateData): void {
		templateData.label.setResource({
			resource: element.uri,
			name: basename(element.uri),
		}, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: element.operation === SessionFileOperation.Deleted,
			title: getSessionFileTitle(element, this._labelService),
		});

		templateData.toolbar.setActions([toAction({
			id: 'sessionFiles.openFile',
			label: localize('sessionFiles.openFileAction', "Open File"),
			class: ThemeIcon.asClassName(Codicon.goToFile),
			run: () => this._onOpenFile(element),
		})]);
	}

	disposeTemplate(templateData: ISessionFileTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

/**
 * A widget that lists the files created, edited or deleted **outside** the
 * session workspace during the session. Rendered between the changes tree and
 * the CI checks widget in the changes view as a resizable SplitView pane.
 *
 * The collapse/resize behaviour mirrors {@link CIStatusWidget}.
 */
export class SessionFilesWidget extends Disposable {

	static readonly HEADER_HEIGHT = 34; // 6px header margin-top + 8px header padding + 20px header min-height
	static readonly MIN_BODY_HEIGHT = 3 * SessionFileListDelegate.ITEM_HEIGHT + 2;
	static readonly PREFERRED_BODY_HEIGHT = 4 * SessionFileListDelegate.ITEM_HEIGHT;
	static readonly MAX_BODY_HEIGHT = 240;

	private readonly _domNode: HTMLElement;
	private readonly _headerNode: HTMLElement;
	private readonly _titleNode: HTMLElement;
	private readonly _titleLabelNode: HTMLElement;
	private readonly _countNode: HTMLElement;
	private readonly _chevronNode: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _list: WorkbenchList<ISessionFile>;
	private readonly _labels: ResourceLabels;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private readonly _onDidToggleCollapsed = this._register(new Emitter<boolean>());
	readonly onDidToggleCollapsed = this._onDidToggleCollapsed.event;

	private _fileCount = 0;
	private _collapsed = false;

	get element(): HTMLElement {
		return this._domNode;
	}

	/** The full content height the widget would like (header + all files). */
	get desiredHeight(): number {
		if (this._fileCount === 0) {
			return 0;
		}
		if (this._collapsed) {
			return SessionFilesWidget.HEADER_HEIGHT;
		}
		return SessionFilesWidget.HEADER_HEIGHT + this._fileCount * SessionFileListDelegate.ITEM_HEIGHT;
	}

	/** Whether the widget is currently visible (has files to show). */
	get visible(): boolean {
		return this._fileCount > 0;
	}

	/** Whether the body is collapsed (header-only). */
	get collapsed(): boolean {
		return this._collapsed;
	}

	constructor(
		container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
		@IEditorService private readonly _editorService: IEditorService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IFileService private readonly _fileService: IFileService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		this._domNode = dom.append(container, $('.session-files-widget'));
		this._domNode.style.display = 'none';

		// Enable file icons from the active file icon theme for the resource
		// labels rendered in this widget's list.
		this._register(createFileIconThemableTreeContainerScope(this._domNode, this._themeService));

		// Header (always visible, click to collapse/expand)
		this._headerNode = dom.append(this._domNode, $('.session-files-widget-header'));
		this._titleNode = dom.append(this._headerNode, $('.session-files-widget-title'));
		this._titleLabelNode = dom.append(this._titleNode, $('.session-files-widget-title-label'));
		this._titleLabelNode.textContent = localize('sessionFiles.label', "Other Files");
		// File count shown in the header only while collapsed (mirrors the
		// customizations section in the sessions view).
		this._countNode = dom.append(this._headerNode, $('.session-files-widget-count.hidden'));
		this._chevronNode = dom.append(this._headerNode, $('.group-chevron'));
		this._chevronNode.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		this._headerNode.setAttribute('role', 'button');
		this._headerNode.setAttribute('aria-label', localize('sessionFiles.toggle', "Toggle Other Files"));
		this._headerNode.setAttribute('aria-expanded', 'true');
		this._headerNode.tabIndex = 0;

		this._register(this._hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this._headerNode,
			localize('sessionFiles.hover', "Files created, edited, or deleted outside the workspace during this session. These files are not part of the workspace and won't be committed."),
		));

		// Register the gesture target so the toggle works on touch platforms
		// (notably iOS) in the Sessions window, then handle both mouse click and
		// touch tap.
		this._register(Gesture.addTarget(this._headerNode));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(this._headerNode, eventType, () => {
				this._toggleCollapsed();
			}));
		}
		this._register(dom.addDisposableListener(this._headerNode, dom.EventType.KEY_DOWN, e => {
			if ((e.key === 'Enter' || e.key === ' ') && e.target === this._headerNode) {
				e.preventDefault();
				this._toggleCollapsed();
			}
		}));

		// Body (list of files)
		const bodyId = 'session-files-widget-body';
		this._bodyNode = dom.append(this._domNode, $(`.${bodyId}`));
		this._bodyNode.id = bodyId;
		this._headerNode.setAttribute('aria-controls', bodyId);

		const listContainer = $('.session-files-widget-list');
		this._list = this._register(this._instantiationService.createInstance(
			WorkbenchList<ISessionFile>,
			'SessionFilesWidget',
			listContainer,
			new SessionFileListDelegate(),
			[this._instantiationService.createInstance(SessionFileListRenderer, this._labels, (file: ISessionFile) => this._openFilePlain(file))],
			{
				multipleSelectionSupport: false,
				openOnSingleClick: true,
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('sessionFiles.listAriaLabel', "Other Files"),
					getAriaLabel: item => localize('sessionFiles.fileAriaLabel', "{0}, {1}", basename(item.uri), getSessionFileOperationLabel(item.operation)),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: item => basename(item.uri),
				},
			},
		));
		this._bodyNode.appendChild(listContainer);

		this._register(this._list.onDidOpen(e => {
			if (e.element) {
				void this._openFile(e.element, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
			}
		}));
	}

	setInput(input: ISessionFilesInput): IDisposable {
		return autorun(reader => {
			const files = input.sessionFilesObs.read(reader);

			const oldCount = this._fileCount;
			this._fileCount = files.length;

			if (files.length === 0) {
				this._setCollapsed(false);
				this._renderBody([]);
				this._domNode.style.display = 'none';
				if (oldCount !== 0) {
					this._onDidChangeHeight.fire();
				}
				return;
			}

			this._domNode.style.display = '';
			this._renderBody(files);
			this._renderCount();

			if (this._fileCount !== oldCount) {
				this._onDidChangeHeight.fire();
			}
		});
	}

	/**
	 * Layout the widget body list to the given height.
	 * Called by the parent view after computing available space.
	 */
	layout(height: number): void {
		if (this._collapsed) {
			this._bodyNode.style.display = 'none';
			return;
		}
		this._bodyNode.style.display = '';
		this._list.layout(height);
	}

	private _toggleCollapsed(): void {
		this._setCollapsed(!this._collapsed);
		this._onDidToggleCollapsed.fire(this._collapsed);
		this._onDidChangeHeight.fire();
	}

	/**
	 * Expand the body if it is currently collapsed, notifying listeners so the
	 * parent pane restores its size. No-op when already expanded.
	 */
	expand(): void {
		if (!this._collapsed) {
			return;
		}
		this._setCollapsed(false);
		this._onDidToggleCollapsed.fire(false);
		this._onDidChangeHeight.fire();
	}

	/**
	 * Move keyboard focus into the files list. Falls back to the header when the
	 * body is collapsed or there is nothing to focus.
	 */
	focus(): void {
		if (this._collapsed || this._fileCount === 0) {
			this._headerNode.focus();
			return;
		}
		this._list.domFocus();
		if (this._list.length > 0 && this._list.getFocus().length === 0) {
			this._list.setFocus([0]);
		}
	}

	private _setCollapsed(collapsed: boolean): void {
		this._collapsed = collapsed;
		this._updateChevron();
		this._headerNode.classList.toggle('collapsed', collapsed);
		this._headerNode.setAttribute('aria-expanded', String(!collapsed));
		this._renderCount();
	}

	/** Show the file count in the header only while collapsed. */
	private _renderCount(): void {
		this._countNode.textContent = this._fileCount > 0 ? `${this._fileCount}` : '';
		this._countNode.classList.toggle('hidden', !this._collapsed || this._fileCount === 0);
	}

	private _updateChevron(): void {
		this._chevronNode.className = 'group-chevron';
		this._chevronNode.classList.add(
			...ThemeIcon.asClassNameArray(
				this._collapsed ? Codicon.chevronRight : Codicon.chevronDown
			)
		);
	}

	private _renderBody(files: readonly ISessionFile[]): void {
		this._list.splice(0, this._list.length, files);
	}

	private async _openFile(file: ISessionFile, preserveFocus: boolean, pinned: boolean): Promise<void> {
		// Created and deleted files open normally; modified files open a diff
		// against their pre-session content when it is available and non-empty.
		if (file.operation === SessionFileOperation.Modified && file.originalUri && await this._hasContent(file.originalUri)) {
			await this._editorService.openEditor({
				original: { resource: file.originalUri },
				modified: { resource: file.uri },
				label: getDiffEditorLabel(file.uri, this._labelService),
				options: { preserveFocus, pinned },
			}, ACTIVE_GROUP);
			return;
		}

		await this._editorService.openEditor({
			resource: file.uri,
			options: { preserveFocus, pinned },
		}, ACTIVE_GROUP);
	}

	private async _hasContent(resource: URI): Promise<boolean> {
		try {
			const content = await this._fileService.readFile(resource);
			return content.value.byteLength > 0;
		} catch {
			return false;
		}
	}

	/** Open the file in a normal editor, ignoring the pre-session diff. */
	private _openFilePlain(file: ISessionFile): void {
		void this._editorService.openEditor({ resource: file.uri }, ACTIVE_GROUP);
	}
}

function getSessionFileOperationLabel(operation: SessionFileOperation): string {
	switch (operation) {
		case SessionFileOperation.Created:
			return localize('sessionFiles.created', "Created");
		case SessionFileOperation.Modified:
			return localize('sessionFiles.modified', "Modified");
		case SessionFileOperation.Deleted:
			return localize('sessionFiles.deleted', "Deleted");
	}
}

function getSessionFileTitle(file: ISessionFile, labelService: ILabelService): string {
	const path = labelService.getUriLabel(file.uri);
	return localize('sessionFiles.title', "{0} ({1})", path, getSessionFileOperationLabel(file.operation));
}

function getDiffEditorLabel(uri: URI, labelService: ILabelService): string {
	return localize('sessionFiles.diffLabel', "{0} (Session Changes)", basename(uri) || labelService.getUriLabel(uri));
}
