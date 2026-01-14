/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/typegroupededitortabscontrol.css';
import { Dimension, $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsView, IEditorGroupView, IEditorPartsView, IInternalEditorOpenOptions } from './editor.js';
import { IEditorTabsControl } from './editorTabsControl.js';
import { MultiEditorTabsControl } from './multiEditorTabsControl.js';
import { IEditorPartOptions, EditorsOrder, GroupModelChangeKind } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { StickyEditorGroupModel, TypeFilteredEditorGroupModel } from '../../../common/editor/filteredEditorGroupModel.js';
import { IEditorTitleControlDimensions } from './editorTitleControl.js';
import { IReadonlyEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { EditorTypeGroupRegistry, IEditorTypeGroup, IEditorTypeGroupRegistry, EditorTypeGroupIds } from './editorTypeGroups.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';

/**
 * Represents a collapsed type tab that shows the count of editors
 * for a type group that is not currently expanded.
 */
class CollapsedTypeTab extends Disposable {

	private readonly element: HTMLElement;
	private readonly badge: CountBadge;
	private count: number = 0;

	constructor(
		private readonly parent: HTMLElement,
		private readonly typeGroup: IEditorTypeGroup,
		private readonly onExpandRequested: (typeGroupId: string) => void,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();

		this.element = $('.collapsed-type-tab');
		this.element.setAttribute('role', 'tab');
		this.element.setAttribute('aria-label', this.getAriaLabel());
		this.element.tabIndex = 0;

		// Icon
		const iconElement = $('.collapsed-type-tab-icon');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(this.typeGroup.icon));
		this.element.appendChild(iconElement);

		// Label
		const labelElement = $('.collapsed-type-tab-label');
		labelElement.textContent = this.typeGroup.label;
		this.element.appendChild(labelElement);

		// Badge
		const badgeContainer = $('.collapsed-type-tab-badge');
		this.badge = this._register(new CountBadge(badgeContainer, {}, defaultCountBadgeStyles));
		this.element.appendChild(badgeContainer);

		// Hover
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.element, this.getHoverContent()));

		// Click handler
		this._register(addDisposableListener(this.element, EventType.CLICK, () => {
			this.onExpandRequested(this.typeGroup.id);
		}));

		// Keyboard handler
		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this.onExpandRequested(this.typeGroup.id);
			}
		}));

		this.parent.appendChild(this.element);
	}

	setCount(count: number): void {
		this.count = count;
		this.badge.setCount(count);
		this.element.setAttribute('aria-label', this.getAriaLabel());

		// Hide if no editors
		this.element.classList.toggle('hidden', count === 0);
	}

	private getAriaLabel(): string {
		return localize('collapsedTypeTabAriaLabel', "{0}, {1} editors", this.typeGroup.label, this.count);
	}

	private getHoverContent(): string {
		return localize('collapsedTypeTabHover', "Click to expand {0} ({1} editors)", this.typeGroup.label, this.count);
	}

	override dispose(): void {
		this.element.remove();
		super.dispose();
	}
}

/**
 * An editor tabs control that groups tabs by their editor type.
 *
 * Structure:
 * - Sticky tabs row (always visible, for pinned/sticky editors)
 * - Expanded row containing:
 *   - Expanded type group tabs (individual tabs for the active type group)
 *   - Collapsed type tabs inline (summary tabs for inactive type groups with badge counts)
 */
export class TypeGroupedEditorTabsControl extends Disposable implements IEditorTabsControl {

	private readonly stickyEditorTabsControl: IEditorTabsControl;
	private readonly expandedTypeTabsControl: IEditorTabsControl;

	private readonly typeGroupRegistry: IEditorTypeGroupRegistry;
	private expandedTypeGroupId: string;

	private readonly collapsedTypeTabs: Map<string, CollapsedTypeTab> = new Map();
	private readonly collapsedTypeTabsContainer: HTMLElement;

	private readonly stickyModel: StickyEditorGroupModel;
	private readonly expandedTypeModel: TypeFilteredEditorGroupModel;

	private activeControl: IEditorTabsControl | undefined;
	private lastActiveEditorPerType: Map<string, EditorInput> = new Map();

	constructor(
		private readonly parent: HTMLElement,
		editorPartsView: IEditorPartsView,
		private readonly groupsView: IEditorGroupsView,
		private readonly groupView: IEditorGroupView,
		private readonly model: IReadonlyEditorGroupModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		// Initialize the type group registry
		this.typeGroupRegistry = this._register(new EditorTypeGroupRegistry());

		// Determine initial expanded type group based on active editor
		this.expandedTypeGroupId = this.getTypeGroupForActiveEditor();

		// Create filtered models
		this.stickyModel = this._register(new StickyEditorGroupModel(this.model));
		this.expandedTypeModel = this._register(new TypeFilteredEditorGroupModel(
			this.model,
			(editor) => this.isEditorInExpandedTypeGroup(editor)
		));

		// Create sticky tabs control
		this.stickyEditorTabsControl = this._register(this.instantiationService.createInstance(
			MultiEditorTabsControl,
			this.parent,
			editorPartsView,
			this.groupsView,
			this.groupView,
			this.stickyModel
		));

		// Create expanded type tabs control
		this.expandedTypeTabsControl = this._register(this.instantiationService.createInstance(
			MultiEditorTabsControl,
			this.parent,
			editorPartsView,
			this.groupsView,
			this.groupView,
			this.expandedTypeModel
		));

		// Create container for collapsed type tabs
		// This will be positioned absolutely over the tabs row
		this.collapsedTypeTabsContainer = $('.collapsed-type-tabs-container');
		this.collapsedTypeTabsContainer.setAttribute('role', 'tablist');
		this.parent.appendChild(this.collapsedTypeTabsContainer);

		// Add the type-grouped-tabs class to parent for CSS styling
		this.parent.classList.add('type-grouped-tabs');

		// Initialize child controls with existing editors from the model
		this.initializeWithExistingEditors();

		// Initialize collapsed type tabs
		this.updateCollapsedTypeTabs();

		// Handle state changes
		this.handleTabBarsStateChange();

		// Listen for model changes
		this._register(this.model.onDidModelChange(e => this.onModelChange(e)));
	}

	private onModelChange(e: { kind: GroupModelChangeKind; editor?: EditorInput }): void {
		switch (e.kind) {
			case GroupModelChangeKind.EDITOR_ACTIVE:
				this.handleActiveEditorChange(e.editor);
				break;
			case GroupModelChangeKind.EDITOR_OPEN:
			case GroupModelChangeKind.EDITOR_CLOSE:
			case GroupModelChangeKind.EDITOR_STICKY:
				this.updateCollapsedTypeTabs();
				this.handleTabBarsLayoutChange();
				break;
		}
	}

	private initializeWithExistingEditors(): void {
		// Get all editors from the model and populate the child controls
		const allEditors = this.model.getEditors(EditorsOrder.SEQUENTIAL);

		// Initialize sticky tabs control with sticky editors
		const stickyEditors = allEditors.filter(e => this.model.isSticky(e));
		if (stickyEditors.length > 0) {
			this.stickyEditorTabsControl.openEditors(stickyEditors);
		}

		// Initialize expanded type tabs control with non-sticky editors of the expanded type
		const expandedTypeEditors = allEditors.filter(e =>
			!this.model.isSticky(e) && this.isEditorInExpandedTypeGroup(e)
		);
		if (expandedTypeEditors.length > 0) {
			this.expandedTypeTabsControl.openEditors(expandedTypeEditors);
		}
	}

	private handleActiveEditorChange(editor: EditorInput | undefined): void {
		if (!editor || this.model.isSticky(editor)) {
			return; // Sticky editors don't affect type group expansion
		}

		const typeGroup = this.typeGroupRegistry.getTypeGroupForEditor(editor);

		// Track last active editor per type
		this.lastActiveEditorPerType.set(typeGroup.id, editor);

		// If the active editor's type group is different, expand it
		if (typeGroup.id !== this.expandedTypeGroupId) {
			this.expandTypeGroup(typeGroup.id);
		}
	}

	private expandTypeGroup(typeGroupId: string): void {
		if (this.expandedTypeGroupId === typeGroupId) {
			return;
		}

		// Get editors that were in the old expanded type (to close their tabs)
		const oldExpandedEditors = this.model.getEditors(EditorsOrder.SEQUENTIAL).filter(e =>
			!this.model.isSticky(e) && this.isEditorInExpandedTypeGroup(e)
		);

		this.expandedTypeGroupId = typeGroupId;

		// Update the filter on the expanded type model
		this.expandedTypeModel.setTypeGroupFilter((editor) => this.isEditorInExpandedTypeGroup(editor));

		// Close tabs for editors no longer in expanded type
		this.expandedTypeTabsControl.closeEditors(oldExpandedEditors);

		// Update collapsed type tabs
		this.updateCollapsedTypeTabs();

		// Add animation classes
		this.parent.classList.add('type-group-animating');

		// Get editors in the new expanded type
		const newExpandedEditors = this.model.getEditors(EditorsOrder.SEQUENTIAL).filter(e =>
			!this.model.isSticky(e) && this.isEditorInExpandedTypeGroup(e)
		);

		// Open tabs for editors in the new expanded type
		this.expandedTypeTabsControl.openEditors(newExpandedEditors);

		// Remove animation class after transition
		setTimeout(() => {
			this.parent.classList.remove('type-group-animating');
		}, 150);

		// If there's a last active editor for this type, activate it
		const lastActive = this.lastActiveEditorPerType.get(typeGroupId);
		if (lastActive && this.model.contains(lastActive)) {
			this.groupView.openEditor(lastActive, { preserveFocus: true });
		}

		this.handleTabBarsStateChange();
	}

	private isEditorInExpandedTypeGroup(editor: EditorInput): boolean {
		const typeGroup = this.typeGroupRegistry.getTypeGroupForEditor(editor);
		return typeGroup.id === this.expandedTypeGroupId;
	}

	private getTypeGroupForActiveEditor(): string {
		const activeEditor = this.model.activeEditor;
		if (activeEditor && !this.model.isSticky(activeEditor)) {
			const typeGroup = this.typeGroupRegistry.getTypeGroupForEditor(activeEditor);
			return typeGroup.id;
		}
		// Default to text editors
		return EditorTypeGroupIds.TextEditors;
	}

	private updateCollapsedTypeTabs(): void {
		// Clear all existing collapsed tabs - dispose them properly
		for (const tab of this.collapsedTypeTabs.values()) {
			tab.dispose();
		}
		this.collapsedTypeTabs.clear();

		// Get all non-sticky editors grouped by type
		const editorsByType = new Map<string, EditorInput[]>();
		for (const editor of this.model.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true })) {
			const typeGroup = this.typeGroupRegistry.getTypeGroupForEditor(editor);
			const editors = editorsByType.get(typeGroup.id) ?? [];
			editors.push(editor);
			editorsByType.set(typeGroup.id, editors);
		}

		// Create collapsed type tabs for non-expanded groups that have editors
		for (const typeGroup of this.typeGroupRegistry.getTypeGroups()) {
			const editors = editorsByType.get(typeGroup.id) ?? [];
			const isExpanded = typeGroup.id === this.expandedTypeGroupId;

			if (!isExpanded && editors.length > 0) {
				// Create collapsed tab for this type group
				const collapsedTab = this.instantiationService.createInstance(
					CollapsedTypeTab,
					this.collapsedTypeTabsContainer,
					typeGroup,
					(typeGroupId) => this.expandTypeGroup(typeGroupId)
				);
				collapsedTab.setCount(editors.length);
				this.collapsedTypeTabs.set(typeGroup.id, collapsedTab);
			}
		}
	}

	private handleTabBarsStateChange(): void {
		this.activeControl = this.model.activeEditor ? this.getEditorTabsController(this.model.activeEditor) : undefined;
		this.handleTabBarsLayoutChange();
	}

	private handleTabBarsLayoutChange(): void {
		if (this.groupView.count === 0) {
			return; // No tabs visible
		}

		const hasStickyTabs = this.model.stickyCount > 0;

		// Update CSS classes for layout
		this.parent.classList.toggle('has-sticky-tabs', hasStickyTabs);
		this.parent.classList.toggle('type-grouped-tabs', true);

		this.groupView.relayout();
	}

	private didActiveControlChange(): boolean {
		return this.activeControl !== (this.model.activeEditor ? this.getEditorTabsController(this.model.activeEditor) : undefined);
	}

	private getEditorTabsController(editor: EditorInput): IEditorTabsControl | undefined {
		if (this.model.isSticky(editor)) {
			return this.stickyEditorTabsControl;
		}
		// Only return expandedTypeTabsControl if the editor is in the expanded type group
		if (this.isEditorInExpandedTypeGroup(editor)) {
			return this.expandedTypeTabsControl;
		}
		// Editor is not displayed as an individual tab (it's in a collapsed group)
		return undefined;
	}

	openEditor(editor: EditorInput, options?: IInternalEditorOpenOptions): boolean {
		// Check if this editor's type requires expanding a different type group
		if (!this.model.isSticky(editor)) {
			const typeGroup = this.typeGroupRegistry.getTypeGroupForEditor(editor);
			if (typeGroup.id !== this.expandedTypeGroupId) {
				// expandTypeGroup will close old tabs and open new ones including this editor
				this.expandTypeGroup(typeGroup.id);
				this.handleOpenedEditors();
				return true;
			}
		}

		// Editor is either sticky or in the currently expanded type group
		const didActiveControlChange = this.didActiveControlChange();
		const control = this.model.isSticky(editor) ? this.stickyEditorTabsControl : this.expandedTypeTabsControl;
		const didOpenEditorChange = control.openEditor(editor, options);

		const didChange = didOpenEditorChange || didActiveControlChange;
		if (didChange) {
			this.handleOpenedEditors();
		}
		return didChange;
	}

	openEditors(editors: EditorInput[]): boolean {
		const stickyEditors = editors.filter(e => this.model.isSticky(e));
		const expandedEditors = editors.filter(e => !this.model.isSticky(e) && this.isEditorInExpandedTypeGroup(e));

		const didActiveControlChange = this.didActiveControlChange();
		const didChangeSticky = this.stickyEditorTabsControl.openEditors(stickyEditors);
		const didChangeExpanded = this.expandedTypeTabsControl.openEditors(expandedEditors);

		const didChange = didChangeSticky || didChangeExpanded || didActiveControlChange;
		if (didChange) {
			this.handleOpenedEditors();
		}

		return didChange;
	}

	private handleOpenedEditors(): void {
		this.handleTabBarsStateChange();
		this.updateCollapsedTypeTabs();
	}

	beforeCloseEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor)?.beforeCloseEditor(editor);
	}

	closeEditor(editor: EditorInput): void {
		// Close from both controls since state might have changed
		this.stickyEditorTabsControl.closeEditor(editor);
		this.expandedTypeTabsControl.closeEditor(editor);

		this.handleClosedEditors();
	}

	closeEditors(editors: EditorInput[]): void {
		const stickyEditors = editors.filter(e => this.model.isSticky(e));
		const unstickyEditors = editors.filter(e => !this.model.isSticky(e));

		this.stickyEditorTabsControl.closeEditors(stickyEditors);
		this.expandedTypeTabsControl.closeEditors(unstickyEditors);

		this.handleClosedEditors();
	}

	private handleClosedEditors(): void {
		this.handleTabBarsStateChange();
		this.updateCollapsedTypeTabs();
	}

	moveEditor(editor: EditorInput, fromIndex: number, targetIndex: number, stickyStateChange: boolean): void {
		if (stickyStateChange) {
			if (this.model.isSticky(editor)) {
				this.stickyEditorTabsControl.openEditor(editor);
				this.expandedTypeTabsControl.closeEditor(editor);
			} else {
				this.stickyEditorTabsControl.closeEditor(editor);
				// Only add to expanded tabs if in the expanded type group
				if (this.isEditorInExpandedTypeGroup(editor)) {
					this.expandedTypeTabsControl.openEditor(editor);
				}
			}
			this.handleTabBarsStateChange();
		} else {
			if (this.model.isSticky(editor)) {
				this.stickyEditorTabsControl.moveEditor(editor, fromIndex, targetIndex, stickyStateChange);
			} else {
				// For type-grouped tabs, movement within a type group is handled by the expanded control
				// Movement between type groups is not allowed (automatic grouping)
				const fromTypeGroup = this.typeGroupRegistry.getTypeGroupForEditor(editor);
				if (fromTypeGroup.id === this.expandedTypeGroupId) {
					const stickyOffset = this.model.stickyCount;
					this.expandedTypeTabsControl.moveEditor(
						editor,
						fromIndex - stickyOffset,
						targetIndex - stickyOffset,
						stickyStateChange
					);
				}
			}
		}
		this.updateCollapsedTypeTabs();
	}

	pinEditor(editor: EditorInput): void {
		this.getEditorTabsController(editor)?.pinEditor(editor);
	}

	stickEditor(editor: EditorInput): void {
		this.expandedTypeTabsControl.closeEditor(editor);
		this.stickyEditorTabsControl.openEditor(editor);
		this.handleTabBarsStateChange();
		this.updateCollapsedTypeTabs();
	}

	unstickEditor(editor: EditorInput): void {
		this.stickyEditorTabsControl.closeEditor(editor);
		// Only add to expanded tabs if in the expanded type group
		if (this.isEditorInExpandedTypeGroup(editor)) {
			this.expandedTypeTabsControl.openEditor(editor);
		}
		this.handleTabBarsStateChange();
		this.updateCollapsedTypeTabs();
	}

	setActive(isActive: boolean): void {
		this.stickyEditorTabsControl.setActive(isActive);
		this.expandedTypeTabsControl.setActive(isActive);
	}

	updateEditorSelections(): void {
		this.stickyEditorTabsControl.updateEditorSelections();
		this.expandedTypeTabsControl.updateEditorSelections();
	}

	updateEditorLabel(editor: EditorInput): void {
		this.getEditorTabsController(editor)?.updateEditorLabel(editor);
	}

	updateEditorDirty(editor: EditorInput): void {
		this.getEditorTabsController(editor)?.updateEditorDirty(editor);
	}

	updateOptions(oldOptions: IEditorPartOptions, newOptions: IEditorPartOptions): void {
		this.stickyEditorTabsControl.updateOptions(oldOptions, newOptions);
		this.expandedTypeTabsControl.updateOptions(oldOptions, newOptions);
	}

	layout(dimensions: IEditorTitleControlDimensions): Dimension {
		// Layout sticky tabs
		const stickyDimensions = this.stickyEditorTabsControl.layout(dimensions);

		// Calculate available dimensions for expanded tabs
		const expandedAvailableDimensions = {
			container: dimensions.container,
			available: new Dimension(
				dimensions.available.width,
				dimensions.available.height - stickyDimensions.height
			)
		};

		// Layout expanded type tabs (collapsed tabs are inline, so no extra height)
		const expandedDimensions = this.expandedTypeTabsControl.layout(expandedAvailableDimensions);

		return new Dimension(
			dimensions.container.width,
			stickyDimensions.height + expandedDimensions.height
		);
	}

	getHeight(): number {
		const stickyHeight = this.stickyEditorTabsControl.getHeight();
		const expandedHeight = this.expandedTypeTabsControl.getHeight();

		// Collapsed tabs are inline with expanded tabs, so no extra height
		return stickyHeight + expandedHeight;
	}

	override dispose(): void {
		this.parent.classList.toggle('type-grouped-tabs', false);
		this.collapsedTypeTabsContainer.remove();

		for (const tab of this.collapsedTypeTabs.values()) {
			tab.dispose();
		}
		this.collapsedTypeTabs.clear();

		super.dispose();
	}
}
