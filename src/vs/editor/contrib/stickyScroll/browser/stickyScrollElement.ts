/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Iterable } from 'vs/base/common/iterator';
import { URI } from 'vs/base/common/uri';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { FoldingRegions } from 'vs/editor/contrib/folding/browser/foldingRanges';

export class StickyRange {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number
	) { }
}

export class StickyElement {

	private static comparator(range1: StickyRange, range2: StickyRange): number {
		if (range1.startLineNumber !== range2.startLineNumber) {
			return range1.startLineNumber - range2.startLineNumber;
		} else {
			return range2.endLineNumber - range1.endLineNumber;
		}
	}

	public static fromOutlineElement(outlineElement: OutlineElement, previousStartLine: number): StickyElement {
		const children: StickyElement[] = [];
		for (const child of outlineElement.children.values()) {
			if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
				if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
					children.push(StickyElement.fromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
				} else {
					for (const subchild of child.children.values()) {
						children.push(StickyElement.fromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
					}
				}
			}
		}
		children.sort((child1, child2) => this.comparator(child1.range!, child2.range!));
		const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
		return new StickyElement(range, children, undefined);
	}

	public static fromOutlineModel(outlineModel: OutlineModel, preferredProvider: string | undefined): { stickyOutlineElement: StickyElement; providerID: string | undefined } {

		let outlineElements: Map<string, OutlineElement>;
		// When several possible outline providers
		if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
			const provider = Iterable.find(outlineModel.children.values(), outlineGroupOfModel => outlineGroupOfModel.id === preferredProvider);
			if (provider) {
				outlineElements = provider.children;
			} else {
				let tempID = '';
				let maxTotalSumOfRanges = -1;
				let optimalOutlineGroup = undefined;
				for (const [_key, outlineGroup] of outlineModel.children.entries()) {
					const totalSumRanges = StickyElement.findSumOfRangesOfGroup(outlineGroup);
					if (totalSumRanges > maxTotalSumOfRanges) {
						optimalOutlineGroup = outlineGroup;
						maxTotalSumOfRanges = totalSumRanges;
						tempID = outlineGroup.id;
					}
				}
				preferredProvider = tempID;
				outlineElements = optimalOutlineGroup!.children;
			}
		} else {
			outlineElements = outlineModel.children as Map<string, OutlineElement>;
		}
		const stickyChildren: StickyElement[] = [];
		const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
			const range1: StickyRange = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
			const range2: StickyRange = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
			return this.comparator(range1, range2);
		});
		for (const outlineElement of outlineElementsArray) {
			stickyChildren.push(StickyElement.fromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
		}
		const stickyOutlineElement = new StickyElement(undefined, stickyChildren, undefined);

		return {
			stickyOutlineElement: stickyOutlineElement,
			providerID: preferredProvider
		};
	}

	private static findSumOfRangesOfGroup(outline: OutlineGroup | OutlineElement): number {
		let res = 0;
		for (const child of outline.children.values()) {
			res += this.findSumOfRangesOfGroup(child);
		}
		if (outline instanceof OutlineElement) {
			return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
		} else {
			return res;
		}
	}

	public static fromFoldingRegions(foldingRegions: FoldingRegions): StickyElement {
		const length = foldingRegions.length;
		const orderedStickyElements: StickyElement[] = [];

		// The root sticky outline element
		const stickyOutlineElement = new StickyElement(
			undefined,
			[],
			undefined
		);

		for (let i = 0; i < length; i++) {
			// Finding the parent index of the current range
			const parentIndex = foldingRegions.getParentIndex(i);

			let parentNode;
			if (parentIndex !== -1) {
				// Access the reference of the parent node
				parentNode = orderedStickyElements[parentIndex];
			} else {
				// In that case the parent node is the root node
				parentNode = stickyOutlineElement;
			}

			const child = new StickyElement(
				new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1),
				[],
				parentNode
			);
			parentNode.children.push(child);
			orderedStickyElements.push(child);
		}
		return stickyOutlineElement;
	}

	constructor(
		/**
		 * Range of line numbers spanned by the current scope
		 */
		public readonly range: StickyRange | undefined,
		/**
		 * Must be sorted by start line number
		*/
		public readonly children: StickyElement[],
		/**
		 * Parent sticky outline element
		 */
		public readonly parent: StickyElement | undefined
	) {
	}
}

export class StickyModel {
	constructor(
		readonly uri: URI,
		readonly version: number,
		readonly element: StickyElement | undefined,
		readonly outlineProviderId: string | undefined
	) { }
}
