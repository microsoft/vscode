/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';

/** How a Sessions list row steps in below its header. Mirrors the row margins in `sessionsList.css`. */
export const enum SessionRowIndent {
	/** A section or custom group header, or a row outside sections, which steps in by its group depth only. */
	Header,
	/** A row within a section or group, which `sessions.list.indentItems` steps in by one more level. */
	Item,
	/** A comparison's header, attempts and their chats, which `sessions.list.indentItems` steps in by at least one level. */
	Comparison,
}

/** How many custom groups deep a Sessions list row is nested, and how it steps in below its header. */
export interface ISessionRowIndent {
	readonly depth: number;
	readonly indent: SessionRowIndent;
}

/** The parts of the tree that tell which row the list shows below a row. */
export interface ISessionsListIndentGuidesTree<T> {
	hasElement(element: T): boolean;
	getNode(element: T | null): ITreeNode<T | null, unknown>;
	getParentElement(element: T | null): T | null;
}

interface IIndentGuidesTemplate<TTemplateData> {
	readonly row: HTMLElement | null;
	readonly templateData: TTemplateData;
}

/** How many guides a row draws without and with `sessions.list.indentItems`: one for each level it steps in by. */
interface IGuideCounts {
	readonly guides: number;
	readonly indented: number;
}

const NO_GUIDES: IGuideCounts = { guides: 0, indented: 0 };

function getGuideCounts({ depth, indent }: ISessionRowIndent): IGuideCounts {
	return {
		guides: depth,
		indented: indent === SessionRowIndent.Item ? depth + 1 : indent === SessionRowIndent.Comparison ? Math.max(depth, 1) : depth,
	};
}

function setRowProperty(row: HTMLElement, name: string, value: number): void {
	const text = String(value);
	if (row.style.getPropertyValue(name) !== text) {
		row.style.setProperty(name, text);
	}
}

/**
 * Limits the tree indent guides of each Sessions list row to the levels that
 * the row steps in by, both with and without `sessions.list.indentItems`, so
 * that a header's guide runs only beside the rows indented below it and never
 * through a row's icon.
 *
 * Spaced rows also draw their guides through the gap below them, but only the
 * guides that the row below draws too, so that a group's guide ends at its
 * last row instead of sticking out below it. The row below comes from the
 * tree. Rows can be added, removed or collapsed below a row without rendering
 * it again, so call {@link refresh} after the tree changes.
 */
export class SessionsListIndentGuides<T> {

	/** The rendered rows, including sticky rows, and the element that each shows. */
	private readonly renderedRows = new Map<HTMLElement, T>();

	constructor(
		private readonly getRowIndent: (element: T) => ISessionRowIndent,
		private readonly getTree: () => ISessionsListIndentGuidesTree<T>,
	) { }

	/** Wraps a renderer of the tree so that the rows it renders draw their indent guides. */
	wrapRenderer<TFilterData, TTemplateData>(renderer: ITreeRenderer<T, TFilterData, TTemplateData>): ITreeRenderer<T, TFilterData, IIndentGuidesTemplate<TTemplateData>> {
		return {
			templateId: renderer.templateId,
			rowClassName: renderer.rowClassName,
			onDidChangeTwistieState: renderer.onDidChangeTwistieState,
			renderTemplate: container => ({ row: container.closest<HTMLElement>('.monaco-list-row'), templateData: renderer.renderTemplate(container) }),
			renderElement: (node, index, template, details) => {
				if (template.row) {
					this.renderedRows.set(template.row, node.element);
					this.updateRow(template.row, node.element);
				}
				renderer.renderElement(node, index, template.templateData, details);
			},
			disposeElement: (node, index, template, details) => {
				if (template.row) {
					this.renderedRows.delete(template.row);
				}
				renderer.disposeElement?.(node, index, template.templateData, details);
			},
			disposeTemplate: template => renderer.disposeTemplate(template.templateData),
			renderTwistie: renderer.renderTwistie && ((element, twistieElement) => renderer.renderTwistie?.(element, twistieElement) ?? false),
		};
	}

	/** Updates the guides below the rendered rows, whose next rows may have changed without the rows being rendered again. */
	refresh(): void {
		for (const [row, element] of this.renderedRows) {
			this.updateRow(row, element);
		}
	}

	private updateRow(row: HTMLElement, element: T): void {
		const guides = getGuideCounts(this.getRowIndent(element));
		const next = this.getNextRowElement(element);
		const nextGuides = next === undefined ? NO_GUIDES : getGuideCounts(this.getRowIndent(next));
		setRowProperty(row, '--session-indent-guides', guides.guides);
		setRowProperty(row, '--session-indent-guides-indented', guides.indented);
		setRowProperty(row, '--session-indent-guides-below', Math.min(guides.guides, nextGuides.guides));
		setRowProperty(row, '--session-indent-guides-below-indented', Math.min(guides.indented, nextGuides.indented));
	}

	/** The element of the row that the list shows below the row of `element`, if any. */
	private getNextRowElement(element: T): T | undefined {
		const tree = this.getTree();
		if (!tree.hasElement(element)) {
			return undefined;
		}
		// An expanded row is followed by its first child that the filter shows.
		const node = tree.getNode(element);
		if (!node.collapsed) {
			const child = node.children.find(child => child.visible);
			if (child?.element) {
				return child.element;
			}
		}
		// Otherwise by the next shown sibling of the row, or of its closest ancestor that has one.
		for (let current: T | null = element; current !== null;) {
			const parent = tree.getParentElement(current);
			const siblings = tree.getNode(parent).children;
			for (let index = siblings.findIndex(sibling => sibling.element === current) + 1; index > 0 && index < siblings.length; index++) {
				const sibling = siblings[index];
				if (sibling.visible && sibling.element) {
					return sibling.element;
				}
			}
			current = parent;
		}
		return undefined;
	}
}
