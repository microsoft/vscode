/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	INavigableView,
	INavigableViewContainer,
	IViewNavigationRequest,
	IViewNavigationSnapshot,
	ViewNavigationLocation,
	resolveViewNavigationTarget
} from '../../../browser/actions/viewNavigationModel.js';

export function makeView(id: string, overrides: Partial<INavigableView> = {}): INavigableView {
	return { id, visible: true, ...overrides };
}

export function makeContainer(
	id: string,
	location: ViewNavigationLocation,
	views: readonly (string | INavigableView)[],
	active = true
): INavigableViewContainer {
	return {
		id,
		location,
		active,
		views: views.map(view => typeof view === 'string' ? makeView(view) : view)
	};
}

export function makeSnapshot(
	containers: readonly INavigableViewContainer[],
	focusedViewId?: string,
	preferredContainerId?: string,
	preferredLocation?: ViewNavigationLocation
): IViewNavigationSnapshot {
	return { containers, focusedViewId, preferredContainerId, preferredLocation };
}

/**
 * Seven focus destinations, spread across three visible workbench locations.
 * The same fixture is shared by container-only and cross-container tests.
 */
export function standardSnapshot(focusedViewId?: string): IViewNavigationSnapshot {
	return makeSnapshot([
		makeContainer('explorer', 'sidebar', ['a', 'b', 'c']),
		makeContainer('auxiliary', 'auxiliarybar', ['d', 'e']),
		makeContainer('problems', 'panel', ['f', 'g'])
	], focusedViewId, undefined, 'sidebar');
}

export function targetId(
	snapshot: IViewNavigationSnapshot,
	request: IViewNavigationRequest
): string | undefined {
	return resolveViewNavigationTarget(snapshot, request)?.viewId;
}

export function focused(snapshot: IViewNavigationSnapshot, focus: string | undefined): IViewNavigationSnapshot {
	return { ...snapshot, focusedViewId: focus };
}

export function withContainers(
	snapshot: IViewNavigationSnapshot,
	containers: readonly INavigableViewContainer[]
): IViewNavigationSnapshot {
	return { ...snapshot, containers };
}

export function withPreference(
	snapshot: IViewNavigationSnapshot,
	preferredContainerId?: string,
	preferredLocation?: ViewNavigationLocation
): IViewNavigationSnapshot {
	return { ...snapshot, preferredContainerId, preferredLocation };
}

export const standardViewOrder = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

export const standardContainerByView: Readonly<Record<string, string>> = {
	a: 'explorer',
	b: 'explorer',
	c: 'explorer',
	d: 'auxiliary',
	e: 'auxiliary',
	f: 'problems',
	g: 'problems'
};
