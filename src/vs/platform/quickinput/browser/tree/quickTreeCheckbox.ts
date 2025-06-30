/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IQuickTreeItem } from '../../common/quickInput.js';
import { defaultCheckboxStyles } from '../../../theme/browser/defaultStyles.js';

export interface IQuickTreeCheckboxChangeEvent {
	readonly element: IQuickTreeItem;
	readonly checked: boolean;
}

/**
 * Platform-level checkbox component for QuickTree that respects layering restrictions
 */
export class QuickTreeCheckbox extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<IQuickTreeCheckboxChangeEvent>());
	readonly onDidChange: Event<IQuickTreeCheckboxChangeEvent> = this._onDidChange.event;

	private checkbox: Checkbox | undefined;
	private currentElement: IQuickTreeItem | undefined;

	public static readonly CSS_CLASS = 'quick-tree-checkbox';

	constructor(
		private readonly container: HTMLElement,
		_hoverDelegate?: IHoverDelegate
	) {
		super();
		// hoverDelegate could be used for future tooltip enhancements
	}

	/**
	 * Render the checkbox for the given element
	 */
	public render(element: IQuickTreeItem): void {
		this.currentElement = element;

		// Initialize checked property if it doesn't exist
		if (element.checked === undefined) {
			element.checked = false;
		}

		if (!this.checkbox) {
			this.createCheckbox();
		}

		this.updateCheckboxState(element);
		this.show();
	}

	private createCheckbox(): void {
		// Clear any existing content from the container first
		dom.clearNode(this.container);

		this.checkbox = new Checkbox('', false, defaultCheckboxStyles);

		this.checkbox.domNode.classList.add(QuickTreeCheckbox.CSS_CLASS);
		this.checkbox.domNode.tabIndex = -1; // Let tree handle focus

		// Handle checkbox changes
		this._register(this.checkbox.onChange(() => {
			if (this.currentElement && this.checkbox) {
				const newChecked = this.checkbox.checked;
				this._onDidChange.fire({
					element: this.currentElement,
					checked: newChecked
				});
			}
		}));

		// Prevent event bubbling when clicking directly on the checkbox
		this._register(dom.addStandardDisposableListener(this.checkbox.domNode, dom.EventType.CLICK, e => {
			e.stopPropagation();
		}));

		this._register(this.checkbox);
		this.container.appendChild(this.checkbox.domNode);
	}

	private updateCheckboxState(element: IQuickTreeItem): void {
		if (!this.checkbox) {
			return;
		}

		// Handle tri-state: true, false, or 'partial'
		if (element.checked === 'partial') {
			this.checkbox.checked = false;
			this.checkbox.domNode.classList.add('partial');
		} else {
			const isChecked = element.checked === true;
			this.checkbox.checked = isChecked;
			this.checkbox.domNode.classList.remove('partial');
		}

		// Update title/tooltip
		this.checkbox.setTitle(this.getCheckboxTitle(element));

		// Handle disabled state
		if (element.disabled) {
			this.checkbox.disable();
		} else {
			this.checkbox.enable();
		}
	}

	private getCheckboxTitle(element: IQuickTreeItem): string {
		if (element.tooltip && typeof element.tooltip === 'string') {
			return element.tooltip;
		}

		// Default titles based on state
		switch (element.checked) {
			case true:
				return `Checked: ${element.label}`;
			case false:
				return `Unchecked: ${element.label}`;
			case 'partial':
				return `Partially checked: ${element.label}`;
			default:
				return element.label;
		}
	}

	private show(): void {
		if (this.checkbox) {
			this.checkbox.domNode.style.display = '';
		}
	}

	/**
	 * Get the current checked state
	 */
	public get checked(): boolean | 'partial' | undefined {
		return this.currentElement?.checked;
	}

	/**
	 * Programmatically set the checked state
	 */
	public setChecked(checked: boolean | 'partial' | undefined): void {
		if (this.currentElement) {
			this.currentElement.checked = checked;
			this.updateCheckboxState(this.currentElement);
		}
	}

	override dispose(): void {
		// Clear the container to prevent DOM node accumulation
		dom.clearNode(this.container);
		this.checkbox = undefined;
		this.currentElement = undefined;
		super.dispose();
	}
}

/**
 * Manages checkbox state changes and cascading updates for QuickTree
 */
export class QuickTreeCheckboxManager extends Disposable {
	private readonly _onDidChangeCheckboxState = this._register(new Emitter<IQuickTreeCheckboxChangeEvent[]>());
	readonly onDidChangeCheckboxState: Event<IQuickTreeCheckboxChangeEvent[]> = this._onDidChangeCheckboxState.event;

	/**
	 * Handle a checkbox change and apply cascading logic
	 */
	public handleCheckboxChange(event: IQuickTreeCheckboxChangeEvent, getAllElements: () => IQuickTreeItem[]): void {
		const affectedElements: IQuickTreeCheckboxChangeEvent[] = [];

		// Update the changed element
		event.element.checked = event.checked;
		affectedElements.push(event);

		// Apply cascading logic
		const allElements = getAllElements();
		const cascadingChanges = this.applyCascadingLogic(event.element, allElements);

		affectedElements.push(...cascadingChanges);

		// Fire the consolidated change event
		if (affectedElements.length > 0) {
			this._onDidChangeCheckboxState.fire(affectedElements);
		}
	}

	/**
	 * Apply cascading checkbox logic when an element's state changes
	 */
	private applyCascadingLogic(changedElement: IQuickTreeItem, allElements: IQuickTreeItem[]): IQuickTreeCheckboxChangeEvent[] {
		const changes: IQuickTreeCheckboxChangeEvent[] = [];

		// Build parent-child relationships
		const elementMap = new Map<string, IQuickTreeItem>();
		const children = new Map<string, IQuickTreeItem[]>();
		const parent = new Map<string, IQuickTreeItem>();

		// Create mappings (assuming elements have unique labels for now)
		allElements.forEach(element => {
			elementMap.set(element.label, element);
		});

		// TODO: Build proper parent-child relationships based on tree structure
		// For now, this is a simplified version that can be enhanced

		// Update children to match parent
		this.updateChildrenState(changedElement, changes, children);

		// Update parents based on children state
		this.updateParentState(changedElement, changes, parent, children);

		return changes;
	}

	private updateChildrenState(
		parentElement: IQuickTreeItem,
		changes: IQuickTreeCheckboxChangeEvent[],
		children: Map<string, IQuickTreeItem[]>
	): void {
		const childElements = children.get(parentElement.label) || [];

		childElements.forEach(child => {
			if (child.checked !== undefined && child.checked !== parentElement.checked) {
				child.checked = parentElement.checked;
				changes.push({
					element: child,
					checked: parentElement.checked === true
				});

				// Recursively update grandchildren
				this.updateChildrenState(child, changes, children);
			}
		});
	}

	private updateParentState(
		childElement: IQuickTreeItem,
		changes: IQuickTreeCheckboxChangeEvent[],
		parent: Map<string, IQuickTreeItem>,
		children: Map<string, IQuickTreeItem[]>
	): void {
		const parentElement = parent.get(childElement.label);
		if (!parentElement || parentElement.checked === undefined) {
			return;
		}

		const siblings = children.get(parentElement.label) || [];
		const checkedSiblings = siblings.filter(s => s.checked === true);
		const uncheckedSiblings = siblings.filter(s => s.checked === false);

		let newParentState: boolean | 'partial' | undefined;

		if (checkedSiblings.length === siblings.length) {
			// All children checked
			newParentState = true;
		} else if (uncheckedSiblings.length === siblings.length) {
			// All children unchecked
			newParentState = false;
		} else {
			// Mixed state
			newParentState = 'partial';
		}

		if (parentElement.checked !== newParentState) {
			parentElement.checked = newParentState;
			changes.push({
				element: parentElement,
				checked: newParentState === true
			});

			// Recursively update grandparent
			this.updateParentState(parentElement, changes, parent, children);
		}
	}
}
