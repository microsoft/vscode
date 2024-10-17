/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editordroptarget.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isAncestor } from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { assertAllDefined, assertIsDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { activeContrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodeDataTransfers, containsDragType, Extensions as DragAndDropExtensions, IDragAndDropContributionRegistry, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, extractTreeDropData, ResourcesDropHandler } from '../../dnd.js';
import { fillActiveEditorViewState, IEditorGroupView } from './editor.js';
import { EditorInputCapabilities, IEditorIdentifier, IUntypedEditorInput } from '../../../common/editor.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BORDER, EDITOR_DROP_INTO_PROMPT_FOREGROUND } from '../../../common/theme.js';
import { GroupDirection, IEditorDropTargetDelegate, IEditorGroup, IEditorGroupsService, IMergeGroupOptions, MergeGroupMode } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';

interface IDropOperation {
	splitDirection?: GroupDirection;
}

function isDropIntoEditorEnabledGlobally(configurationService: IConfigurationService) {
	return configurationService.getValue<boolean>('editor.dropIntoEditor.enabled');
}

function isDragIntoEditorEvent(e: DragEvent): boolean {
	return e.shiftKey;
}

class DropOverlay extends Themable {

	private static readonly OVERLAY_ID = 'monaco-workbench-editor-drop-overlay';

	private container: HTMLElement | undefined;
	private overlay: HTMLElement | undefined;
	private dropIntoPromptElement?: HTMLSpanElement;

	private currentDropOperation: IDropOperation | undefined;

	private _disposed: boolean | undefined;
	get disposed(): boolean { return !!this._disposed; }

	private cleanupOverlayScheduler: RunOnceScheduler;

	private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	private readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();
	private readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();

	private readonly enableDropIntoEditor: boolean;

	constructor(
		private readonly groupView: IEditorGroupView,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ITreeViewsDnDService private readonly treeViewsDragAndDropService: ITreeViewsDnDService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService
	) {
		super(themeService);

		this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this.enableDropIntoEditor = isDropIntoEditorEnabledGlobally(this.configurationService) && this.isDropIntoActiveEditorEnabled();

		this.create();
	}

	private create(): void {
		const overlayOffsetHeight = this.getOverlayOffsetHeight();

		// Container
		const container = this.container = document.createElement('div');
		container.id = DropOverlay.OVERLAY_ID;
		container.style.top = `${overlayOffsetHeight}px`;

		// Parent
		this.groupView.element.appendChild(container);
		this.groupView.element.classList.add('dragged-over');
		this._register(toDisposable(() => {
			container.remove();
			this.groupView.element.classList.remove('dragged-over');
		}));

		// Overlay
		this.overlay = document.createElement('div');
		this.overlay.classList.add('editor-group-overlay-indicator');
		container.appendChild(this.overlay);

		if (this.enableDropIntoEditor) {
			this.dropIntoPromptElement = renderFormattedText(localize('dropIntoEditorPrompt', "Hold __{0}__ to drop into editor", isMacintosh ? '⇧' : 'Shift'), {});
			this.dropIntoPromptElement.classList.add('editor-group-overlay-drop-into-prompt');
			this.overlay.appendChild(this.dropIntoPromptElement);
		}

		// Overlay Event Handling
		this.registerListeners(container);

		// Styles
		this.updateStyles();
	}

	override updateStyles(): void {
		const overlay = assertIsDefined(this.overlay);

		// Overlay drop background
		overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';

		// Overlay contrast border (if any)
		const activeContrastBorderColor = this.getColor(activeContrastBorder);
		overlay.style.outlineColor = activeContrastBorderColor || '';
		overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
		overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
		overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';

		if (this.dropIntoPromptElement) {
			this.dropIntoPromptElement.style.backgroundColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BACKGROUND) ?? '';
			this.dropIntoPromptElement.style.color = this.getColor(EDITOR_DROP_INTO_PROMPT_FOREGROUND) ?? '';

			const borderColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BORDER);
			if (borderColor) {
				this.dropIntoPromptElement.style.borderWidth = '1px';
				this.dropIntoPromptElement.style.borderStyle = 'solid';
				this.dropIntoPromptElement.style.borderColor = borderColor;
			} else {
				this.dropIntoPromptElement.style.borderWidth = '0';
			}
		}
	}

	private registerListeners(container: HTMLElement): void {
		this._register(new DragAndDropObserver(container, {
			onDragOver: e => {
				if (this.enableDropIntoEditor && isDragIntoEditorEvent(e)) {
					this.dispose();
					return;
				}

				const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
				const isDraggingEditor = this.editorTransfer.hasData(DraggedEditorIdentifier.prototype);

				// Update the dropEffect to "copy" if there is no local data to be dragged because
				// in that case we can only copy the data into and not move it from its source
				if (!isDraggingEditor && !isDraggingGroup && e.dataTransfer) {
					e.dataTransfer.dropEffect = 'copy';
				}

				// Find out if operation is valid
				let isCopy = true;
				if (isDraggingGroup) {
					isCopy = this.isCopyOperation(e);
				} else if (isDraggingEditor) {
					const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
					if (Array.isArray(data) && data.length > 0) {
						isCopy = this.isCopyOperation(e, data[0].identifier);
					}
				}

				if (!isCopy) {
					const sourceGroupView = this.findSourceGroupView();
					if (sourceGroupView === this.groupView) {
						if (isDraggingGroup || (isDraggingEditor && sourceGroupView.count < 2)) {
							this.hideOverlay();
							return; // do not allow to drop group/editor on itself if this results in an empty group
						}
					}
				}

				// Position overlay and conditionally enable or disable
				// editor group splitting support based on setting and
				// keymodifiers used.
				let splitOnDragAndDrop = !!this.editorGroupService.partOptions.splitOnDragAndDrop;
				if (this.isToggleSplitOperation(e)) {
					splitOnDragAndDrop = !splitOnDragAndDrop;
				}
				this.positionOverlay(e.offsetX, e.offsetY, isDraggingGroup, splitOnDragAndDrop);

				// Make sure to stop any running cleanup scheduler to remove the overlay
				if (this.cleanupOverlayScheduler.isScheduled()) {
					this.cleanupOverlayScheduler.cancel();
				}
			},

			onDragLeave: e => this.dispose(),
			onDragEnd: e => this.dispose(),

			onDrop: e => {
				EventHelper.stop(e, true);

				// Dispose overlay
				this.dispose();

				// Handle drop if we have a valid operation
				if (this.currentDropOperation) {
					this.handleDrop(e, this.currentDropOperation.splitDirection);
				}
			}
		}));

		this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
			// Under some circumstances we have seen reports where the drop overlay is not being
			// cleaned up and as such the editor area remains under the overlay so that you cannot
			// type into the editor anymore. This seems related to using VMs and DND via host and
			// guest OS, though some users also saw it without VMs.
			// To protect against this issue we always destroy the overlay as soon as we detect a
			// mouse event over it. The delay is used to guarantee we are not interfering with the
			// actual DROP event that can also trigger a mouse over event.
			if (!this.cleanupOverlayScheduler.isScheduled()) {
				this.cleanupOverlayScheduler.schedule();
			}
		}));
	}

	private isDropIntoActiveEditorEnabled(): boolean {
		return !!this.groupView.activeEditor?.hasCapability(EditorInputCapabilities.CanDropIntoEditor);
	}

	private findSourceGroupView(): IEditorGroup | undefined {

		// Check for group transfer
		if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				return this.editorGroupService.getGroup(data[0].identifier);
			}
		}

		// Check for editor transfer
		else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				return this.editorGroupService.getGroup(data[0].identifier.groupId);
			}
		}

		return undefined;
	}

	private async handleDrop(event: DragEvent, splitDirection?: GroupDirection): Promise<void> {

		// Determine target group
		const ensureTargetGroup = () => {
			let targetGroup: IEditorGroup;
			if (typeof splitDirection === 'number') {
				targetGroup = this.editorGroupService.addGroup(this.groupView, splitDirection);
			} else {
				targetGroup = this.groupView;
			}

			return targetGroup;
		};

		// Check for group transfer
		if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
			const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const sourceGroup = this.editorGroupService.getGroup(data[0].identifier);
				if (sourceGroup) {
					if (typeof splitDirection !== 'number' && sourceGroup === this.groupView) {
						return;
					}

					// Split to new group
					let targetGroup: IEditorGroup | undefined;
					if (typeof splitDirection === 'number') {
						if (this.isCopyOperation(event)) {
							targetGroup = this.editorGroupService.copyGroup(sourceGroup, this.groupView, splitDirection);
						} else {
							targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
						}
					}

					// Merge into existing group
					else {
						let mergeGroupOptions: IMergeGroupOptions | undefined = undefined;
						if (this.isCopyOperation(event)) {
							mergeGroupOptions = { mode: MergeGroupMode.COPY_EDITORS };
						}

						this.editorGroupService.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
					}

					if (targetGroup) {
						this.editorGroupService.activateGroup(targetGroup);
					}
				}

				this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
			}
		}

		// Check for editor transfer
		else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const draggedEditors = data;
				const firstDraggedEditor = data[0].identifier;

				const sourceGroup = this.editorGroupService.getGroup(firstDraggedEditor.groupId);
				if (sourceGroup) {
					const copyEditor = this.isCopyOperation(event, firstDraggedEditor);
					let targetGroup: IEditorGroup | undefined = undefined;

					// Optimization: if we move the last editor of an editor group
					// and we are configured to close empty editor groups, we can
					// rather move the entire editor group according to the direction
					if (this.editorGroupService.partOptions.closeEmptyGroups && sourceGroup.count === 1 && typeof splitDirection === 'number' && !copyEditor) {
						targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
					}

					// In any other case do a normal move/copy operation
					else {
						targetGroup = ensureTargetGroup();
						if (sourceGroup === targetGroup) {
							return;
						}

						const editors = draggedEditors.map(draggedEditor => (
							{
								editor: draggedEditor.identifier.editor,
								options: fillActiveEditorViewState(sourceGroup, draggedEditor.identifier.editor, {
									pinned: true,													// always pin dropped editor
									sticky: sourceGroup.isSticky(draggedEditor.identifier.editor)	// preserve sticky state
								})
							}
						));

						if (!copyEditor) {
							sourceGroup.moveEditors(editors, targetGroup);
						} else {
							sourceGroup.copyEditors(editors, targetGroup);
						}
					}

					// Ensure target has focus
					targetGroup.focus();
				}

				this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
			}
		}

		// Check for tree items
		else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
			const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
			if (Array.isArray(data) && data.length > 0) {
				const editors: IUntypedEditorInput[] = [];
				for (const id of data) {
					const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
					if (dataTransferItem) {
						const treeDropData = await extractTreeDropData(dataTransferItem);
						editors.push(...treeDropData.map(editor => ({ ...editor, options: { ...editor.options, pinned: true } })));
					}
				}
				if (editors.length) {
					this.editorService.openEditors(editors, ensureTargetGroup(), { validateTrust: true });
				}
			}

			this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
		}

		// Check for URI transfer
		else {
			const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: !isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) });
			dropHandler.handleDrop(event, getWindow(this.groupView.element), () => ensureTargetGroup(), targetGroup => targetGroup?.focus());
		}
	}

	private isCopyOperation(e: DragEvent, draggedEditor?: IEditorIdentifier): boolean {
		if (draggedEditor?.editor.hasCapability(EditorInputCapabilities.Singleton)) {
			return false; // Singleton editors cannot be split
		}

		return (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
	}

	private isToggleSplitOperation(e: DragEvent): boolean {
		return (e.altKey && !isMacintosh) || (e.shiftKey && isMacintosh);
	}

	private positionOverlay(mousePosX: number, mousePosY: number, isDraggingGroup: boolean, enableSplitting: boolean): void {
		const preferSplitVertically = this.editorGroupService.partOptions.openSideBySideDirection === 'right';

		const editorControlWidth = this.groupView.element.clientWidth;
		const editorControlHeight = this.groupView.element.clientHeight - this.getOverlayOffsetHeight();

		let edgeWidthThresholdFactor: number;
		let edgeHeightThresholdFactor: number;
		if (enableSplitting) {
			if (isDraggingGroup) {
				edgeWidthThresholdFactor = preferSplitVertically ? 0.3 : 0.1; // give larger threshold when dragging group depending on preferred split direction
			} else {
				edgeWidthThresholdFactor = 0.1; // 10% threshold to split if dragging editors
			}

			if (isDraggingGroup) {
				edgeHeightThresholdFactor = preferSplitVertically ? 0.1 : 0.3; // give larger threshold when dragging group depending on preferred split direction
			} else {
				edgeHeightThresholdFactor = 0.1; // 10% threshold to split if dragging editors
			}
		} else {
			edgeWidthThresholdFactor = 0;
			edgeHeightThresholdFactor = 0;
		}

		const edgeWidthThreshold = editorControlWidth * edgeWidthThresholdFactor;
		const edgeHeightThreshold = editorControlHeight * edgeHeightThresholdFactor;

		const splitWidthThreshold = editorControlWidth / 3;		// offer to split left/right at 33%
		const splitHeightThreshold = editorControlHeight / 3;	// offer to split up/down at 33%

		// No split if mouse is above certain threshold in the center of the view
		let splitDirection: GroupDirection | undefined;
		if (
			mousePosX > edgeWidthThreshold && mousePosX < editorControlWidth - edgeWidthThreshold &&
			mousePosY > edgeHeightThreshold && mousePosY < editorControlHeight - edgeHeightThreshold
		) {
			splitDirection = undefined;
		}

		// Offer to split otherwise
		else {

			// User prefers to split vertically: offer a larger hitzone
			// for this direction like so:
			// ----------------------------------------------
			// |		|		SPLIT UP		|			|
			// | SPLIT 	|-----------------------|	SPLIT	|
			// |		|		  MERGE			|			|
			// | LEFT	|-----------------------|	RIGHT	|
			// |		|		SPLIT DOWN		|			|
			// ----------------------------------------------
			if (preferSplitVertically) {
				if (mousePosX < splitWidthThreshold) {
					splitDirection = GroupDirection.LEFT;
				} else if (mousePosX > splitWidthThreshold * 2) {
					splitDirection = GroupDirection.RIGHT;
				} else if (mousePosY < editorControlHeight / 2) {
					splitDirection = GroupDirection.UP;
				} else {
					splitDirection = GroupDirection.DOWN;
				}
			}

			// User prefers to split horizontally: offer a larger hitzone
			// for this direction like so:
			// ----------------------------------------------
			// |				SPLIT UP					|
			// |--------------------------------------------|
			// |  SPLIT LEFT  |	   MERGE	|  SPLIT RIGHT  |
			// |--------------------------------------------|
			// |				SPLIT DOWN					|
			// ----------------------------------------------
			else {
				if (mousePosY < splitHeightThreshold) {
					splitDirection = GroupDirection.UP;
				} else if (mousePosY > splitHeightThreshold * 2) {
					splitDirection = GroupDirection.DOWN;
				} else if (mousePosX < editorControlWidth / 2) {
					splitDirection = GroupDirection.LEFT;
				} else {
					splitDirection = GroupDirection.RIGHT;
				}
			}
		}

		// Draw overlay based on split direction
		switch (splitDirection) {
			case GroupDirection.UP:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '50%' });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.DOWN:
				this.doPositionOverlay({ top: '50%', left: '0', width: '100%', height: '50%' });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.LEFT:
				this.doPositionOverlay({ top: '0', left: '0', width: '50%', height: '100%' });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.RIGHT:
				this.doPositionOverlay({ top: '0', left: '50%', width: '50%', height: '100%' });
				this.toggleDropIntoPrompt(false);
				break;
			default:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
				this.toggleDropIntoPrompt(true);
		}

		// Make sure the overlay is visible now
		const overlay = assertIsDefined(this.overlay);
		overlay.style.opacity = '1';

		// Enable transition after a timeout to prevent initial animation
		setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);

		// Remember as current split direction
		this.currentDropOperation = { splitDirection };
	}

	private doPositionOverlay(options: { top: string; left: string; width: string; height: string }): void {
		const [container, overlay] = assertAllDefined(this.container, this.overlay);

		// Container
		const offsetHeight = this.getOverlayOffsetHeight();
		if (offsetHeight) {
			container.style.height = `calc(100% - ${offsetHeight}px)`;
		} else {
			container.style.height = '100%';
		}

		// Overlay
		overlay.style.top = options.top;
		overlay.style.left = options.left;
		overlay.style.width = options.width;
		overlay.style.height = options.height;
	}

	private getOverlayOffsetHeight(): number {

		// With tabs and opened editors: use the area below tabs as drop target
		if (!this.groupView.isEmpty && this.editorGroupService.partOptions.showTabs === 'multiple') {
			return this.groupView.titleHeight.offset;
		}

		// Without tabs or empty group: use entire editor area as drop target
		return 0;
	}

	private hideOverlay(): void {
		const overlay = assertIsDefined(this.overlay);

		// Reset overlay
		this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
		overlay.style.opacity = '0';
		overlay.classList.remove('overlay-move-transition');

		// Reset current operation
		this.currentDropOperation = undefined;
	}

	private toggleDropIntoPrompt(showing: boolean) {
		if (!this.dropIntoPromptElement) {
			return;
		}
		this.dropIntoPromptElement.style.opacity = showing ? '1' : '0';
	}

	contains(element: HTMLElement): boolean {
		return element === this.container || element === this.overlay;
	}

	override dispose(): void {
		super.dispose();

		this._disposed = true;
	}
}

export class EditorDropTarget extends Themable {

	private _overlay?: DropOverlay;

	private counter = 0;

	private readonly editorTransfer = LocalSelectionTransfer.getInstance<DraggedEditorIdentifier>();
	private readonly groupTransfer = LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>();

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IEditorDropTargetDelegate,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(themeService);

		this.registerListeners();
	}

	private get overlay(): DropOverlay | undefined {
		if (this._overlay && !this._overlay.disposed) {
			return this._overlay;
		}

		return undefined;
	}

	private registerListeners(): void {
		this._register(addDisposableListener(this.container, EventType.DRAG_ENTER, e => this.onDragEnter(e)));
		this._register(addDisposableListener(this.container, EventType.DRAG_LEAVE, () => this.onDragLeave()));
		for (const target of [this.container, getWindow(this.container)]) {
			this._register(addDisposableListener(target, EventType.DRAG_END, () => this.onDragEnd()));
		}
	}

	private onDragEnter(event: DragEvent): void {
		if (isDropIntoEditorEnabledGlobally(this.configurationService) && isDragIntoEditorEvent(event)) {
			return;
		}

		this.counter++;

		// Validate transfer
		if (
			!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype) &&
			!this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) &&
			event.dataTransfer
		) {
			const dndContributions = Registry.as<IDragAndDropContributionRegistry>(DragAndDropExtensions.DragAndDropContribution).getAll();
			const dndContributionKeys = Array.from(dndContributions).map(e => e.dataFormatKey);
			if (!containsDragType(event, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.EDITORS, ...dndContributionKeys)) { // see https://github.com/microsoft/vscode/issues/25789
				event.dataTransfer.dropEffect = 'none';
				return; // unsupported transfer
			}
		}

		// Signal DND start
		this.updateContainer(true);

		const target = event.target as HTMLElement;
		if (target) {

			// Somehow we managed to move the mouse quickly out of the current overlay, so destroy it
			if (this.overlay && !this.overlay.contains(target)) {
				this.disposeOverlay();
			}

			// Create overlay over target
			if (!this.overlay) {
				const targetGroupView = this.findTargetGroupView(target);
				if (targetGroupView) {
					this._overlay = this.instantiationService.createInstance(DropOverlay, targetGroupView);
				}
			}
		}
	}

	private onDragLeave(): void {
		this.counter--;

		if (this.counter === 0) {
			this.updateContainer(false);
		}
	}

	private onDragEnd(): void {
		this.counter = 0;

		this.updateContainer(false);
		this.disposeOverlay();
	}

	private findTargetGroupView(child: HTMLElement): IEditorGroupView | undefined {
		const groups = this.editorGroupService.groups as IEditorGroupView[];

		return groups.find(groupView => isAncestor(child, groupView.element) || this.delegate.containsGroup?.(groupView));
	}

	private updateContainer(isDraggedOver: boolean): void {
		this.container.classList.toggle('dragged-over', isDraggedOver);
	}

	override dispose(): void {
		super.dispose();

		this.disposeOverlay();
	}

	private disposeOverlay(): void {
		if (this.overlay) {
			this.overlay.dispose();
			this._overlay = undefined;
		}
	}
}
