/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IChatFindHighlightWindow {
	readonly Highlight?: { new(): { add(range: Range): void; clear(): void; priority?: number } };
	readonly CSS?: { readonly highlights?: { set(name: string, h: unknown): void; delete(name: string): boolean } };
}

export interface IChatFindHighlightRegistry {
	/** Replaces `owner`'s ranges for `name` and repaints the merged highlight. */
	setRanges(owner: object, name: string, ranges: readonly Range[], priority?: number): void;
	/** Removes all of `owner`'s ranges and repaints any affected highlights. */
	clear(owner: object): void;
}

export function supportsCssHighlightApi(targetWindow: IChatFindHighlightWindow): boolean {
	return typeof targetWindow.Highlight !== 'undefined' && !!targetWindow.CSS?.highlights;
}

const registries = new WeakMap<object, IChatFindHighlightRegistry>();

/** Returns the shared highlight registry for a window. */
export function getChatFindHighlightRegistry(targetWindow: IChatFindHighlightWindow): IChatFindHighlightRegistry {
	let registry = registries.get(targetWindow);
	if (!registry) {
		registry = createChatFindHighlightRegistry(targetWindow);
		registries.set(targetWindow, registry);
	}
	return registry;
}

export function createChatFindHighlightRegistry(targetWindow: IChatFindHighlightWindow): IChatFindHighlightRegistry {
	const ownerRanges = new Map<object, Map<string, readonly Range[]>>();
	const highlights = new Map<string, InstanceType<NonNullable<IChatFindHighlightWindow['Highlight']>>>();
	const priorities = new Map<string, number>();

	function repaint(name: string): void {
		const cssHighlights = targetWindow.CSS?.highlights;
		const HighlightCtor = targetWindow.Highlight;
		if (!cssHighlights || !HighlightCtor) {
			return;
		}

		const merged: Range[] = [];
		for (const byName of ownerRanges.values()) {
			merged.push(...(byName.get(name) ?? []));
		}

		if (merged.length === 0) {
			if (highlights.delete(name)) {
				cssHighlights.delete(name);
			}
			return;
		}

		let highlight = highlights.get(name);
		if (!highlight) {
			highlight = new HighlightCtor();
			highlights.set(name, highlight);
		} else {
			highlight.clear();
		}
		const priority = priorities.get(name);
		if (priority !== undefined) {
			highlight.priority = priority;
		}
		for (const range of merged) {
			highlight.add(range);
		}
		cssHighlights.set(name, highlight);
	}

	return {
		setRanges(owner, name, ranges, priority) {
			let byName = ownerRanges.get(owner);
			if (!byName) {
				byName = new Map();
				ownerRanges.set(owner, byName);
			}
			byName.set(name, ranges);
			if (priority !== undefined) {
				priorities.set(name, priority);
			}
			repaint(name);
		},
		clear(owner) {
			const byName = ownerRanges.get(owner);
			if (!byName) {
				return;
			}
			ownerRanges.delete(owner);
			for (const name of byName.keys()) {
				repaint(name);
			}
		},
	};
}
