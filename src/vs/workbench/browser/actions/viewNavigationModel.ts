/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The navigation model deliberately has no dependency on the DOM or workbench services.
 *
 * View containers can be moved between locations, views can be reordered or hidden,
 * and focus can move to an editor while the sidebar stays open. Keeping selection
 * separate from the action that calls openView() makes these cases deterministic.
 */
export type ViewNavigationLocation = 'sidebar' | 'auxiliarybar' | 'panel';
export type ViewNavigationDirection = 'next' | 'previous' | 'first' | 'last';
export type ViewNavigationScope = 'container' | 'workbench';

export interface INavigableView {
	readonly id: string;
	/** A hidden view must not be a keyboard navigation destination. */
	readonly visible: boolean;
	/** Disabled views are not a navigation destination even when visible. */
	readonly enabled?: boolean;
	/**
	 * Collapsed panes still have an accessible header.
	 * They remain navigation targets unless includeCollapsed is false.
	 */
	readonly collapsed?: boolean;
}

export interface INavigableViewContainer {
	readonly id: string;
	readonly location: ViewNavigationLocation;
	/** Only the currently open container in each location participates. */
	readonly active: boolean;
	readonly views: readonly INavigableView[];
}

export interface IViewNavigationSnapshot {
	readonly containers: readonly INavigableViewContainer[];
	readonly focusedViewId?: string;
	readonly preferredContainerId?: string;
	readonly preferredLocation?: ViewNavigationLocation;
}

export interface IViewNavigationRequest {
	readonly direction: ViewNavigationDirection;
	readonly scope: ViewNavigationScope;
	/** Defaults to true. A false value stops at the edge instead of wrapping. */
	readonly wrap?: boolean;
	/** Defaults to true. A collapsed pane's header can still receive focus. */
	readonly includeCollapsed?: boolean;
}

export interface IViewNavigationTarget {
	readonly viewId: string;
	readonly containerId: string;
	readonly location: ViewNavigationLocation;
	readonly index: number;
	readonly total: number;
}

interface INavigationEntry {
	readonly viewId: string;
	readonly containerId: string;
	readonly location: ViewNavigationLocation;
}

const locationOrder: readonly ViewNavigationLocation[] = ['sidebar', 'auxiliarybar', 'panel'];

/**
 * VS Code can show three view container locations at once. Navigation uses a
 * stable ordering across them, regardless of how the containers were supplied
 * by the caller. The order inside an individual container is user-configurable.
 */
export function getViewNavigationLocationOrder(): readonly ViewNavigationLocation[] {
	return locationOrder;
}

/**
 * Construct a snapshot of potential focus targets.
 *
 * The first active container in each location wins. Views with missing IDs,
 * duplicate IDs, or unavailable states are removed. Distinct containers may
 * include the same view during transitions; the first visible instance wins.
 */
export function getNavigableViewEntries(
	snapshot: IViewNavigationSnapshot,
	includeCollapsed = true
): readonly INavigationEntry[] {
	const entries: INavigationEntry[] = [];
	const usedViewIds = new Set<string>();
	const usedLocations = new Set<ViewNavigationLocation>();

	for (const location of locationOrder) {
		for (const container of snapshot.containers) {
			if (!container.id || !container.active || container.location !== location || usedLocations.has(location)) {
				continue;
			}

			usedLocations.add(location);
			for (const view of container.views) {
				if (!view.id || !view.visible || view.enabled === false || (!includeCollapsed && view.collapsed)) {
					continue;
				}
				if (usedViewIds.has(view.id)) {
					continue;
				}

				usedViewIds.add(view.id);
				entries.push({ viewId: view.id, containerId: container.id, location });
			}
		}
	}

	return entries;
}

function getPreferredEntry(
	entries: readonly INavigationEntry[],
	snapshot: IViewNavigationSnapshot,
	direction: ViewNavigationDirection
): INavigationEntry | undefined {
	const backward = direction === 'previous' || direction === 'last';

	if (snapshot.preferredContainerId) {
		const preferred = entries.filter(entry => entry.containerId === snapshot.preferredContainerId);
		if (preferred.length > 0) {
			return backward ? preferred[preferred.length - 1] : preferred[0];
		}
	}

	if (snapshot.preferredLocation) {
		const preferred = entries.filter(entry => entry.location === snapshot.preferredLocation);
		if (preferred.length > 0) {
			return backward ? preferred[preferred.length - 1] : preferred[0];
		}
	}

	return direction === 'previous' || direction === 'last'
		? entries[entries.length - 1]
		: entries[0];
}

/** The focused view is an anchor only while it is actually visible. */
function getAnchor(
	entries: readonly INavigationEntry[],
	snapshot: IViewNavigationSnapshot,
	direction: ViewNavigationDirection
): INavigationEntry | undefined {
	const focused = snapshot.focusedViewId
		? entries.find(entry => entry.viewId === snapshot.focusedViewId)
		: undefined;
	return focused ?? getPreferredEntry(entries, snapshot, direction);
}

function getScopedEntries(
	entries: readonly INavigationEntry[],
	anchor: INavigationEntry,
	scope: ViewNavigationScope
): readonly INavigationEntry[] {
	return scope === 'workbench'
		? entries
		: entries.filter(entry => entry.containerId === anchor.containerId);
}

function getTargetIndex(
	length: number,
	currentIndex: number,
	direction: ViewNavigationDirection,
	wrap: boolean
): number | undefined {
	if (length === 0) {
		return undefined;
	}

	switch (direction) {
		case 'first':
			return 0;
		case 'last':
			return length - 1;
		case 'next':
			if (currentIndex + 1 < length) {
				return currentIndex + 1;
			}
			return wrap ? 0 : undefined;
		case 'previous':
			if (currentIndex > 0) {
				return currentIndex - 1;
			}
			return wrap ? length - 1 : undefined;
	}
}

/**
 * Choose the next keyboard focus destination without mutating the snapshot.
 *
 * When focus is outside a view (for example, in the editor), the selected
 * preferred location is the destination itself, rather than skipping to
 * the next view. This makes repeating a navigation shortcut predictable.
 *
 * No result is returned when there is nowhere to navigate or wrapping has
 * been disabled at an edge.
 */
export function resolveViewNavigationTarget(
	snapshot: IViewNavigationSnapshot,
	request: IViewNavigationRequest
): IViewNavigationTarget | undefined {
	const entries = getNavigableViewEntries(snapshot, request.includeCollapsed ?? true);
	if (entries.length === 0) {
		return undefined;
	}

	const anchor = getAnchor(entries, snapshot, request.direction);
	if (!anchor) {
		return undefined;
	}

	const scoped = getScopedEntries(entries, anchor, request.scope);
	if (scoped.length === 0) {
		return undefined;
	}

	const focusedIndex = snapshot.focusedViewId
		? scoped.findIndex(entry => entry.viewId === snapshot.focusedViewId)
		: -1;

	// When the focused view was hidden or moved, treat it as unanchored.
	// A first/last request always addresses the requested boundary.
	let nextIndex: number | undefined;
	if (request.direction === 'first') {
		nextIndex = 0;
	} else if (request.direction === 'last') {
		nextIndex = scoped.length - 1;
	} else if (focusedIndex === -1) {
		const preferredIndex = scoped.findIndex(entry => entry.viewId === anchor.viewId);
		nextIndex = preferredIndex >= 0 ? preferredIndex : 0;
	} else {
		nextIndex = getTargetIndex(scoped.length, focusedIndex, request.direction, request.wrap ?? true);
	}

	if (nextIndex === undefined) {
		return undefined;
	}

	const next = scoped[nextIndex];
	return {
		viewId: next.viewId,
		containerId: next.containerId,
		location: next.location,
		index: nextIndex,
		total: scoped.length
	};
}
