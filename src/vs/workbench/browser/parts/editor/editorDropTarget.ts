/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editordroptarget.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isAncestor, isHTMLElement } from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { assertReturnsAllDefined, assertReturnsDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { activeContrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodeDataTransfers, containsDragType, Extensions as DragAndDropExtensions, IDragAndDropContributionRegistry, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, extractTreeDropData, getInputDropTargetClipPath, isContentDropTarget, isInputDropTarget, ResourcesDropHandler } from '../../dnd.js';
import { DEFAULT_EDITOR_MIN_DIMENSIONS, GroupTransferKind, IEditorGroupsView, IEditorGroupView, prepareMoveCopyEditors } from './editor.js';
import { EditorInputCapabilities, IEditorIdentifier, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BORDER, EDITOR_DROP_INTO_PROMPT_FOREGROUND } from '../../../common/theme.js';
import { GroupDirection, IEditorDropTargetDelegate, IEditorGroup, IEditorGroupsService, IMergeGroupOptions, MergeGroupMode } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { getPartName } from './editorPartActions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { getEditorsTransferVeto, showEditorTransferVeto } from './editorTransferVeto.js';

interface IDropOperation {
	splitDirection?: GroupDirection;

	/**
	 * Where the drop splits the group evenly, as over content that handles
	 * drops: the size of the new group, as the drop shows it.
	 */
	splitSize?: number;
}

/**
 * The size of the group that an even split of a group adds: half of the
 * group, within the least sizes of the group and of an editor.
 */
function getEvenSplitSize(size: number, groupMinimum: number, newGroupMinimum: number): number {
	return Math.max(newGroupMinimum, Math.min(Math.round(size / 2), size - groupMinimum));
}

function isDropIntoEditorEnabledGlobally(configurationService: IConfigurationService) {
	return configurationService.getValue<boolean>('editor.dropIntoEditor.enabled');
}

function isDragIntoEditorEvent(e: DragEvent): boolean {
	return e.shiftKey;
}

/**
 * Whether a drag, other than of a group, is over a registered input drop target (or an element inside one) inside
 * `scope`, the group under the drag. Such inputs handle the drop themselves: the editor drop overlay has holes over them.
 */
function isInputDropTargetEvent(e: DragEvent, scope: HTMLElement, isDraggingGroup: boolean): boolean {
	return !isDraggingGroup && isHTMLElement(e.target) && isInputDropTarget(e.target, e, scope);
}

/**
 * Whether the drag is over registered content, such as a view shown as an editor, that handles the drops in its center,
 * inside `scope`, the group under the drag.
 */
function isContentDropTargetEvent(e: DragEvent, scope: HTMLElement): boolean {
	return isHTMLElement(e.target) && isContentDropTarget(e.target, e, scope);
}

function isToggleSplitOperation(e: DragEvent): boolean {
	return (e.altKey && !isMacintosh) || (e.shiftKey && isMacintosh);
}

/**
 * Whether a drop splits the group by its position, following the setting
 * and the key modifiers used.
 */
function isSplittingEnabled(e: DragEvent, groupView: IEditorGroupView, supportsSplitting: boolean): boolean {
	let splitOnDragAndDrop = supportsSplitting && !!groupView.groupsView.partOptions.splitOnDragAndDrop;
	if (supportsSplitting && isToggleSplitOperation(e)) {
		splitOnDragAndDrop = !splitOnDragAndDrop;
	}

	return splitOnDragAndDrop;
}

/**
 * The part of a group a drop splits in, for a position in the drop area of the
 * group. A position in the center splits nothing: the drop goes into the group,
 * unless the group only splits (`splitsOnly`), when it splits on the side of
 * the center nearest to the position.
 */
function getSplitDirection(mousePosX: number, mousePosY: number, width: number, height: number, isDraggingGroup: boolean, preferSplitVertically: boolean, splitsOnly = false): GroupDirection | undefined {
	let edgeWidthThresholdFactor: number;
	if (isDraggingGroup) {
		edgeWidthThresholdFactor = preferSplitVertically ? 0.3 : 0.1; // give larger threshold when dragging group depending on preferred split direction
	} else {
		edgeWidthThresholdFactor = 0.1; // 10% threshold to split if dragging editors
	}

	let edgeHeightThresholdFactor: number;
	if (isDraggingGroup) {
		edgeHeightThresholdFactor = preferSplitVertically ? 0.1 : 0.3; // give larger threshold when dragging group depending on preferred split direction
	} else {
		edgeHeightThresholdFactor = 0.1; // 10% threshold to split if dragging editors
	}

	const edgeWidthThreshold = width * edgeWidthThresholdFactor;
	const edgeHeightThreshold = height * edgeHeightThresholdFactor;

	const splitWidthThreshold = width / 3;		// offer to split left/right at 33%
	const splitHeightThreshold = height / 3;	// offer to split up/down at 33%

	// No split if mouse is above certain threshold in the center of the view, or,
	// where the group only splits, a split on the side nearest to the mouse
	if (
		mousePosX > edgeWidthThreshold && mousePosX < width - edgeWidthThreshold &&
		mousePosY > edgeHeightThreshold && mousePosY < height - edgeHeightThreshold
	) {
		if (!splitsOnly) {
			return undefined;
		}

		const sides: [GroupDirection, number][] = [
			[GroupDirection.LEFT, mousePosX / width],
			[GroupDirection.RIGHT, (width - mousePosX) / width],
			[GroupDirection.UP, mousePosY / height],
			[GroupDirection.DOWN, (height - mousePosY) / height]
		];
		return sides.reduce((nearest, side) => side[1] < nearest[1] ? side : nearest)[0];
	}

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
			return GroupDirection.LEFT;
		} else if (mousePosX > splitWidthThreshold * 2) {
			return GroupDirection.RIGHT;
		} else if (mousePosY < height / 2) {
			return GroupDirection.UP;
		} else {
			return GroupDirection.DOWN;
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
	if (mousePosY < splitHeightThreshold) {
		return GroupDirection.UP;
	} else if (mousePosY > splitHeightThreshold * 2) {
		return GroupDirection.DOWN;
	} else if (mousePosX < width / 2) {
		return GroupDirection.LEFT;
	} else {
		return GroupDirection.RIGHT;
	}
}

/**
 * The height at the top of a group that is not part of its drop area: with
 * tabs and opened editors, the area below the tabs is the drop area.
 */
function getDropAreaOffsetHeight(groupView: IEditorGroupView): number {
	if (!groupView.isEmpty && groupView.groupsView.partOptions.showTabs === 'multiple') {
		return groupView.titleHeight.offset;
	}

	return 0;
}

/**
 * The position of a drag in the drop area of a group.
 */
function getDropAreaPosition(e: DragEvent, groupView: IEditorGroupView): { x: number; y: number } {
	const bounds = groupView.element.getBoundingClientRect();

	return { x: e.clientX - bounds.left, y: e.clientY - bounds.top - getDropAreaOffsetHeight(groupView) };
}

/**
 * The drop overlays that show, so that what takes a drag over them, such as an
 * edge of the window, can make them go away.
 */
const dropOverlays = new Set<DropOverlay>();

/**
 * Makes the drop overlays that show over the groups inside `container` go away,
 * such as when what contains them takes the drag.
 */
export function disposeEditorDropOverlays(container: HTMLElement): void {
	for (const overlay of [...dropOverlays]) {
		if (isAncestor(overlay.groupElement, container)) {
			overlay.dispose();
		}
	}
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
		private readonly supportsSplitting: boolean,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@ITreeViewsDnDService private readonly treeViewsDragAndDropService: ITreeViewsDnDService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(themeService);

		this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));

		this.enableDropIntoEditor = isDropIntoEditorEnabledGlobally(this.configurationService) && this.isDropIntoActiveEditorEnabled();

		this.create();

		dropOverlays.add(this);
	}

	private create(): void {
		const overlayOffsetHeight = this.getOverlayOffsetHeight();

		// Container
		const container = this.container = $('div', { id: DropOverlay.OVERLAY_ID });
		container.style.top = `${overlayOffsetHeight}px`;
		container.style.height = `calc(100% - ${overlayOffsetHeight}px)`;

		// Parent
		this.groupView.element.appendChild(container);
		this.updateInputClipPath(container);
		this.groupView.element.classList.add('dragged-over');
		this._register(toDisposable(() => {
			container.remove();
			this.groupView.element.classList.remove('dragged-over');
		}));

		// Overlay
		this.overlay = $('.editor-group-overlay-indicator');
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
		const overlay = assertReturnsDefined(this.overlay);

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

	/**
	 * Updates the overlay for a drag over the group, such as the one that
	 * created it: what a drop there does, or, where the group does not take
	 * the drop, such as over an input, it goes away.
	 */
	update(e: DragEvent): void {
		const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
		const isDraggingEditor = this.editorTransfer.hasData(DraggedEditorIdentifier.prototype);

		// Content that handles drops takes the drop, except for editors and
		// groups: editors go into the group in its center, as tabs, and split
		// it at its edges; groups only split it, also from its center. Inputs
		// take drops through the overlay's holes.
		const overContent = isContentDropTargetEvent(e, this.groupView.element);
		if (
			(this.enableDropIntoEditor && isDragIntoEditorEvent(e)) ||
			(overContent && (!(isDraggingEditor || isDraggingGroup) || !this.isSplittingEnabled(e)))
		) {
			this.dispose();
			return;
		}

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
		const { x, y } = getDropAreaPosition(e, this.groupView);
		this.positionOverlay(x, y, isDraggingGroup, this.isSplittingEnabled(e), overContent && isDraggingGroup, overContent);
		if (this.container) {
			this.updateInputClipPath(this.container);
		}

		// Make sure to stop any running cleanup scheduler to remove the overlay
		if (this.cleanupOverlayScheduler.isScheduled()) {
			this.cleanupOverlayScheduler.cancel();
		}
	}

	private registerListeners(container: HTMLElement): void {
		this._register(new DragAndDropObserver(container, {
			onDragOver: e => this.update(e),
			onDragLeave: e => this.dispose(),
			onDragEnd: e => this.dispose(),

			onDrop: e => {
				if (isContentDropTargetEvent(e, this.groupView.element) && !(
					(this.editorTransfer.hasData(DraggedEditorIdentifier.prototype) || this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) &&
					this.isSplittingEnabled(e)
				)) {
					this.dispose();
					return;
				}

				EventHelper.stop(e, true);

				// An overlay that shows takes its drop, also when no drag moved
				// over it yet, such as when it showed for the drag that created it
				if (!this.currentDropOperation) {
					this.update(e);
				}

				// Dispose overlay
				this.dispose();

				// Handle drop if we have a valid operation
				if (this.currentDropOperation) {
					this.handleDrop(e, this.currentDropOperation);
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

	private updateInputClipPath(container: HTMLElement): void {
		container.style.clipPath = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) ? '' : getInputDropTargetClipPath(this.groupView.element, container);
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

	private async handleDrop(event: DragEvent, operation: IDropOperation): Promise<void> {
		const splitDirection = operation.splitDirection;

		// A group that splits evenly gives the new group the size the drop
		// shows: the part would otherwise expand the new group, such as when
		// the group counts as expanded beside one at its minimum size
		const splitSize = operation.splitSize;
		const splitEvenly = (targetGroup: IEditorGroup) => {
			if (splitSize === undefined || typeof splitDirection !== 'number' || targetGroup === this.groupView) {
				return;
			}

			const size = this.editorGroupService.getSize(targetGroup);
			const vertically = splitDirection === GroupDirection.UP || splitDirection === GroupDirection.DOWN;
			this.editorGroupService.setSize(targetGroup, vertically ? { width: size.width, height: splitSize } : { width: splitSize, height: size.height });
		};

		// Determine target group
		const ensureTargetGroup = () => {
			let targetGroup: IEditorGroup;
			if (typeof splitDirection === 'number') {
				targetGroup = this.editorGroupService.addGroup(this.groupView, splitDirection);
				splitEvenly(targetGroup);
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

					// Into another part only when its editors can go there, before any group is added or moved. A split copies the
					// group with its editors themselves (see `copyGroup`), so all are asked; a merge copies each editor
					const kind = typeof splitDirection === 'number' ? (this.isCopyOperation(event) ? GroupTransferKind.CopyGroup : GroupTransferKind.MoveGroup) : GroupTransferKind.Merge;
					if (this.isTransferVetoed(sourceGroup.editors, sourceGroup, this.isCopyOperation(event) && kind === GroupTransferKind.Merge, kind)) {
						this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
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
						splitEvenly(targetGroup);
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
					const sourcePart = this.editorGroupService.getPart(sourceGroup);
					let targetGroup: IEditorGroup | undefined = undefined;

					// Optimization: if we move the last editor of an editor group
					// and we are configured to close empty editor groups, we can
					// rather move the entire editor group according to the direction
					const moveGroup = this.groupView.groupsView.partOptions.closeEmptyGroups && sourceGroup.count === 1 && typeof splitDirection === 'number' && !copyEditor;

					// Into another part only when the dragged editors can go there, before any group is added or moved
					const kind = moveGroup ? GroupTransferKind.MoveGroup : typeof splitDirection === 'number' ? GroupTransferKind.AddGroup : GroupTransferKind.Merge;
					if (this.isTransferVetoed(draggedEditors.map(editor => editor.identifier.editor), sourceGroup, copyEditor, kind)) {
						this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
						return;
					}

					if (moveGroup) {
						targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
						splitEvenly(targetGroup);
					}

					// In any other case do a normal move/copy operation
					else {
						targetGroup = ensureTargetGroup();
						if (sourceGroup === targetGroup) {
							return;
						}

						const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map(editor => editor.identifier.editor));
						if (!copyEditor) {
							sourceGroup.moveEditors(editorsWithOptions, targetGroup);
						} else {
							sourceGroup.copyEditors(editorsWithOptions, targetGroup);
						}
					}

					// Ensure target has focus
					targetGroup.focus();

					// Announce a move into another part of the window
					const targetPart = this.editorGroupService.getPart(targetGroup);
					if (!copyEditor && targetPart !== sourcePart && targetPart.windowId === sourcePart.windowId) {
						status(localize('movedEditorToPart', "Moved {0} to {1}", firstDraggedEditor.editor.getName(), getPartName(targetPart)));
					}
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

	/**
	 * Whether `editors` of `sourceGroup`, dropped into another part, cannot go there, telling the user why. A group of
	 * the part they are dropped in stands for the group a split adds.
	 */
	private isTransferVetoed(editors: readonly EditorInput[], sourceGroup: IEditorGroup, copy: boolean, kind: GroupTransferKind): boolean {

		// Where the operation puts them, such as the main window for a group added to a compact auxiliary window
		const target = this.groupView.groupsView.getTransferTarget(kind, sourceGroup.id, this.groupView);
		if (this.editorGroupService.getPart(sourceGroup) === this.editorGroupService.getPart(target)) {
			return false;
		}
		const veto = getEditorsTransferVeto(editors, sourceGroup.id, target.id, { copy });
		if (veto) {
			showEditorTransferVeto(this.dialogService, veto);
			return true;
		}

		return false;
	}

	private isCopyOperation(e: DragEvent, draggedEditor?: IEditorIdentifier): boolean {
		if (draggedEditor?.editor.hasCapability(EditorInputCapabilities.Singleton)) {
			return false; // Singleton editors cannot be split
		}

		return (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
	}

	private isSplittingEnabled(e: DragEvent): boolean {
		return isSplittingEnabled(e, this.groupView, this.supportsSplitting);
	}

	/**
	 * @param splitsOnly the group only splits, also from its center
	 * @param splitsEvenly a split gives the new group half of the group, as over content that handles drops
	 */
	private positionOverlay(mousePosX: number, mousePosY: number, isDraggingGroup: boolean, enableSplitting: boolean, splitsOnly: boolean, splitsEvenly: boolean): void {
		const preferSplitVertically = this.groupView.groupsView.partOptions.openSideBySideDirection === 'right';

		const editorControlWidth = this.groupView.element.clientWidth;
		const editorControlHeight = this.groupView.element.clientHeight - this.getOverlayOffsetHeight();

		if (!enableSplitting) {
			this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
			this.toggleDropIntoPrompt(true);
			const overlay = assertReturnsDefined(this.overlay);
			overlay.style.opacity = '1';
			setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);
			this.currentDropOperation = { splitDirection: undefined };
			return;
		}

		const splitDirection = getSplitDirection(mousePosX, mousePosY, editorControlWidth, editorControlHeight, isDraggingGroup, preferSplitVertically, splitsOnly);

		// An even split shows the size the new group gets: half, within the least sizes of the group and of an editor
		const vertically = splitDirection === GroupDirection.UP || splitDirection === GroupDirection.DOWN;
		let splitSize: number | undefined;
		let share = '50%';
		if (splitsEvenly && typeof splitDirection === 'number') {
			const size = this.editorGroupService.getSize(this.groupView);
			const total = vertically ? size.height : size.width;
			splitSize = getEvenSplitSize(total, vertically ? this.groupView.minimumHeight : this.groupView.minimumWidth, vertically ? DEFAULT_EDITOR_MIN_DIMENSIONS.height : DEFAULT_EDITOR_MIN_DIMENSIONS.width);
			share = total > 0 ? `${Math.min(100, splitSize * 100 / total).toFixed(2)}%` : share;
		}
		const rest = share === '50%' ? '50%' : `calc(100% - ${share})`;

		// Draw overlay based on split direction
		switch (splitDirection) {
			case GroupDirection.UP:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: share });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.DOWN:
				this.doPositionOverlay({ top: rest, left: '0', width: '100%', height: share });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.LEFT:
				this.doPositionOverlay({ top: '0', left: '0', width: share, height: '100%' });
				this.toggleDropIntoPrompt(false);
				break;
			case GroupDirection.RIGHT:
				this.doPositionOverlay({ top: '0', left: rest, width: share, height: '100%' });
				this.toggleDropIntoPrompt(false);
				break;
			default:
				this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
				this.toggleDropIntoPrompt(true);
		}

		// Make sure the overlay is visible now
		const overlay = assertReturnsDefined(this.overlay);
		overlay.style.opacity = '1';

		// Enable transition after a timeout to prevent initial animation
		setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);

		// Remember as current split direction
		this.currentDropOperation = { splitDirection, splitSize };
	}

	private doPositionOverlay(options: { top: string; left: string; width: string; height: string }): void {
		const [container, overlay] = assertReturnsAllDefined(this.container, this.overlay);

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
		return getDropAreaOffsetHeight(this.groupView);
	}

	private hideOverlay(): void {
		const overlay = assertReturnsDefined(this.overlay);

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

	get groupElement(): HTMLElement {
		return this.groupView.element;
	}

	override dispose(): void {
		dropOverlays.delete(this);

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
		private readonly groupsView: IEditorGroupsView,
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
		this._register(addDisposableListener(this.container, EventType.DRAG_OVER, e => this.onDragOverContent(e), true /* before the content handles it */));
		for (const target of [this.container, getWindow(this.container)]) {
			this._register(addDisposableListener(target, EventType.DRAG_END, () => this.onDragEnd()));
		}
	}

	private onDragEnter(event: DragEvent): void {
		if (isDropIntoEditorEnabledGlobally(this.configurationService) && isDragIntoEditorEvent(event)) {
			return;
		}

		this.counter++;

		// Inputs registered as drop targets handle the drop themselves, except
		// for groups, and so does content that handles drops, except for
		// editors and groups, which split the group
		const targetElement = isHTMLElement(event.target) ? event.target : undefined;
		const scope = (targetElement && this.findTargetGroupView(targetElement)?.element) ?? this.container;
		if (isInputDropTargetEvent(event, scope, this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype))) {
			this.disposeOverlay();
			this.updateContainer(false);
			return;
		}
		if (isContentDropTargetEvent(event, scope) && !this.splitsOverContent(event)) {
			this.disposeOverlay();
			return;
		}

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

		// Check if dropping into group is allowed
		if (!this.groupsView.partOptions.allowDropIntoGroup) {
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'none';
			}
			return;
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
			this.createOverlay(target);
		}
	}

	private createOverlay(target: HTMLElement): void {
		if (!this.overlay) {
			const targetGroupView = this.findTargetGroupView(target);
			if (targetGroupView) {
				this._overlay = this.instantiationService.createInstance(DropOverlay, targetGroupView, this.delegate.supportsSplitting !== false);
			}
		}
	}

	/**
	 * Over content that handles drops, a drag moves without entering new
	 * elements, so the overlay shows from here for an editor or a group,
	 * which splits the group.
	 */
	private onDragOverContent(event: DragEvent): void {
		const scope = isHTMLElement(event.target) ? this.findTargetGroupView(event.target)?.element : undefined;
		if (
			!this.groupsView.partOptions.allowDropIntoGroup ||
			!isHTMLElement(event.target) ||
			!scope ||
			isInputDropTargetEvent(event, scope, this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) ||
			!isContentDropTargetEvent(event, scope) ||
			!this.splitsOverContent(event)
		) {
			return;
		}

		if (!this.overlay) {
			this.updateContainer(true);
			this.createOverlay(event.target);
		}

		// The overlay shows for this drag already, and the content under it
		// does not show its own drop feedback for it
		const overlay = this._overlay;
		if (overlay && !overlay.disposed) {
			overlay.update(event);
			EventHelper.stop(event, true);
		}
	}

	/**
	 * Whether a drag over content that handles drops splits the group under it:
	 * editors and groups do, anywhere, where splitting is enabled.
	 */
	private splitsOverContent(event: DragEvent): boolean {
		const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
		if (!isDraggingGroup && !this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
			return false;
		}

		const groupView = isHTMLElement(event.target) ? this.findTargetGroupView(event.target) : undefined;
		if (!groupView) {
			return false;
		}

		// Over content that handles drops, editors and groups split the group anywhere: they cannot go into it
		return isSplittingEnabled(event, groupView, this.delegate.supportsSplitting !== false);
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
