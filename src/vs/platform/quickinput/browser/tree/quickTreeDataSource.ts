/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource } from '../../../../base/browser/ui/tree/tree.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IQuickTreeItem } from '../../common/quickInput.js';

export interface IQuickTreeDataSourceOptions {
	/**
	 * Whether to maintain parent references automatically.
	 */
	maintainParentReferences?: boolean;
}

/**
 * Data source for QuickTree that manages hierarchical relationships between tree items.
 * Supports both synchronous and asynchronous data loading patterns.
 */
export class QuickTreeDataSource<T extends IQuickTreeItem> extends Disposable implements IAsyncDataSource<T | T[], T> {

	private readonly _onDidChangeTreeData = this._register(new Emitter<T | T[] | null | undefined>());
	readonly onDidChangeTreeData: Event<T | T[] | null | undefined> = this._onDidChangeTreeData.event;

	private readonly _children = new Map<T | null, T[]>();
	private readonly _parents = new Map<T, T | null>();
	private readonly _options: IQuickTreeDataSourceOptions;

	constructor(options: IQuickTreeDataSourceOptions = {}) {
		super();
		this._options = options;
	}

	/**
	 * Sets the children for a parent item.
	 * @param parent The parent item, or null for root items.
	 * @param children The children to set.
	 */
	setChildren(parent: T | null, children: readonly T[]): void {
		// Store children mapping
		this._children.set(parent, [...children]);

		// Maintain parent references if enabled
		if (this._options.maintainParentReferences) {
			for (const child of children) {
				this._parents.set(child, parent);
				// Also set the parent property if the item supports it
				if (child.parent !== undefined) {
					(child as any).parent = parent;
				}
			}
		}

		// Fire change event
		this._onDidChangeTreeData.fire(parent);
	}

	/**
	 * Gets the children of a parent item.
	 * @param parent The parent item, or null for root items.
	 * @returns The children of the parent.
	 */
	getStoredChildren(parent: T | null): readonly T[] {
		return this._children.get(parent) || [];
	}

	/**
	 * Removes a parent and all its children from the data source.
	 * @param parent The parent to remove.
	 */
	removeParent(parent: T | null): void {
		const children = this._children.get(parent);
		if (children) {
			// Remove parent references for children
			if (this._options.maintainParentReferences) {
				for (const child of children) {
					this._parents.delete(child);
				}
			}

			// Remove children mapping
			this._children.delete(parent);

			// Fire change event
			this._onDidChangeTreeData.fire(parent);
		}
	}

	/**
	 * Clears all data from the data source.
	 */
	clear(): void {
		this._children.clear();
		this._parents.clear();
		this._onDidChangeTreeData.fire(null);
	}

	// IAsyncDataSource implementation

	/**
	 * Determines if an element has children.
	 * @param element The element to check.
	 * @returns True if the element has children.
	 */
	hasChildren(element: T | T[]): boolean {
		if (Array.isArray(element)) {
			// Root case - has children if array is not empty
			return element.length > 0;
		}

		// Check if we have children stored for this element
		const storedChildren = this._children.get(element);
		if (storedChildren !== undefined) {
			return storedChildren.length > 0;
		}

		// Check the element's own children property
		if (element.children !== undefined) {
			return element.children.length > 0;
		}

		// Check collapsible state as a hint
		if (element.collapsibleState !== undefined) {
			return element.collapsibleState !== 0; // 0 = None/No children
		}

		return false;
	}

	/**
	 * Gets the children of an element.
	 * @param element The element to get children for.
	 * @returns The children of the element.
	 */
	getChildren(element: T | T[]): Iterable<T> | Promise<Iterable<T>> {
		if (Array.isArray(element)) {
			// Root case - return the array elements
			return element;
		}

		// First, check if we have stored children
		const storedChildren = this._children.get(element);
		if (storedChildren !== undefined) {
			return storedChildren;
		}

		// Fall back to element's own children property
		if (element.children !== undefined) {
			// Store the children for future lookups
			this.setChildren(element, element.children as T[]);
			return element.children as T[];
		}

		// No children found
		return [];
	}

	/**
	 * Gets the parent of an element.
	 * @param element The element to get the parent for.
	 * @returns The parent of the element.
	 */
	getParentElement(element: T): T | null {
		if (this._options.maintainParentReferences) {
			const storedParent = this._parents.get(element);
			if (storedParent !== undefined) {
				return storedParent;
			}
		}

		// Fall back to element's own parent property
		if (element.parent !== undefined) {
			return element.parent as T | null;
		}

		// No parent found - assume root level
		return null;
	}

	/**
	 * Gets all root items (items with no parent).
	 * @returns Array of root items.
	 */
	getRoots(): T[] {
		return this.getStoredChildren(null) as T[];
	}

	/**
	 * Finds an item by its ID.
	 * @param id The ID to search for.
	 * @returns The item if found, undefined otherwise.
	 */
	findItem(id: string): T | undefined {
		const searchInItems = (items: readonly T[]): T | undefined => {
			for (const item of items) {
				if (item.id === id) {
					return item;
				}

				// Search recursively in children
				const children = this.getStoredChildren(item);
				const found = searchInItems(children);
				if (found) {
					return found;
				}
			}
			return undefined;
		};

		return searchInItems(this.getRoots());
	}

	/**
	 * Gets all descendants of an item.
	 * @param item The item to get descendants for.
	 * @returns Array of all descendant items.
	 */
	getDescendants(item: T): T[] {
		const descendants: T[] = [];
		const children = this.getStoredChildren(item);

		for (const child of children) {
			descendants.push(child);
			descendants.push(...this.getDescendants(child));
		}

		return descendants;
	}

	/**
	 * Gets all ancestors of an item.
	 * @param item The item to get ancestors for.
	 * @returns Array of all ancestor items, from immediate parent to root.
	 */
	getAncestors(item: T): T[] {
		const ancestors: T[] = [];
		let current = this.getParentElement(item);

		while (current) {
			ancestors.push(current);
			current = this.getParentElement(current);
		}

		return ancestors;
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}
}
