/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializedGrid, ISerializedLeafNode, ISerializedNode } from '../../../../base/browser/ui/grid/grid.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { URI } from '../../../../base/common/uri.js';
import { IAuxiliaryWindowOpenOptions } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { MAIN_SESSIONS_PART } from './sessionsPartService.js';

export interface ISessionGridState {
	readonly version: 1;
	readonly grid: ISerializedGrid;
	readonly sessions: readonly { readonly id: string; readonly resource?: string; readonly sticky: boolean }[];
	readonly active: string;
}

export interface ISessionWindowState {
	readonly id: string;
	readonly layout: ISessionGridState;
	readonly window?: IAuxiliaryWindowOpenOptions;
}

export interface ISessionWindowsState {
	readonly version: 2;
	readonly parts: readonly ISessionWindowState[];
	readonly activePart: string;
}

export function isSessionWindowsState(value: unknown): value is ISessionWindowsState {
	if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 2
		|| !('parts' in value) || !Array.isArray(value.parts) || !value.parts.length || value.parts.length > 256
		|| !('activePart' in value) || typeof value.activePart !== 'string') {
		return false;
	}
	const parts = new Set<string>();
	const slots = new Set<string>();
	const resources = new Set<string>();
	for (const part of value.parts) {
		if (!part || typeof part !== 'object' || typeof part.id !== 'string' || !part.id || parts.has(part.id) || !isSessionGridState(part.layout)) {
			return false;
		}
		parts.add(part.id);
		if (part.window !== undefined) {
			const window = part.window;
			if (!window || typeof window !== 'object' || part.id === MAIN_SESSIONS_PART) {
				return false;
			}
			if (window.bounds !== undefined && (!window.bounds || typeof window.bounds !== 'object'
				|| ['x', 'y', 'width', 'height'].some(key => typeof window.bounds[key] !== 'number' || !Number.isFinite(window.bounds[key]))
				|| window.bounds.width <= 0 || window.bounds.height <= 0)) {
				return false;
			}
			if ((window.zoomLevel !== undefined && (typeof window.zoomLevel !== 'number' || !Number.isFinite(window.zoomLevel)))
				|| (window.mode !== undefined && ![0, 1, 2].includes(window.mode))
				|| (window.alwaysOnTop !== undefined && typeof window.alwaysOnTop !== 'boolean')) {
				return false;
			}
		}
		for (const slot of part.layout.sessions) {
			if (slots.has(slot.id) || (slot.resource ? resources.has(slot.resource) : part.id !== MAIN_SESSIONS_PART)) {
				return false;
			}
			slots.add(slot.id);
			if (slot.resource) {
				resources.add(slot.resource);
			}
		}
	}
	return slots.size <= 256 && parts.has(MAIN_SESSIONS_PART) && parts.has(value.activePart);
}

/** Join independent grids horizontally without changing either subtree's internal proportions. */
export function joinSessionGrids(left: ISerializedGrid, right: ISerializedGrid): ISerializedGrid {
	const subtree = (grid: ISerializedGrid): ISerializedNode => {
		const projected = projectSessionGrid(grid, id => id)!;
		const clearMaximized = (node: ISerializedNode): void => {
			if (node.type === 'branch') {
				node.data.forEach(clearMaximized);
			} else {
				delete node.maximized;
			}
		};
		clearMaximized(projected.root);
		return grid.orientation === Orientation.VERTICAL
			? { ...projected.root, size: Math.max(1, grid.width) }
			: { type: 'branch', size: Math.max(1, grid.width), data: [{ ...projected.root, size: Math.max(1, grid.height) }] };
	};
	const height = Math.max(1, left.height, right.height);
	return {
		orientation: Orientation.HORIZONTAL,
		width: Math.max(1, left.width) + Math.max(1, right.width),
		height,
		root: { type: 'branch', size: height, data: [subtree(left), subtree(right)] },
	};
}

export function isSessionGridLeafData(data: unknown): data is { readonly id: string } {
	return !!data && typeof data === 'object' && 'id' in data && typeof data.id === 'string';
}

export function isSessionGridState(value: unknown): value is ISessionGridState {
	if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
		|| !('grid' in value) || !value.grid || typeof value.grid !== 'object'
		|| !('sessions' in value) || !Array.isArray(value.sessions)
		|| !('active' in value) || typeof value.active !== 'string') {
		return false;
	}
	const ids = new Set<string>();
	const resources = new Set<string | undefined>();
	for (const session of value.sessions) {
		if (!session || typeof session !== 'object' || typeof session.id !== 'string' || !session.id
			|| typeof session.sticky !== 'boolean' || (session.resource !== undefined && typeof session.resource !== 'string')
			|| ids.has(session.id) || resources.has(session.resource)) {
			return false;
		}
		ids.add(session.id);
		resources.add(session.resource);
		if (session.resource !== undefined) {
			try {
				URI.parse(session.resource, true);
			} catch {
				return false;
			}
		}
	}
	const grid = value.grid;
	const finiteSize = (size: unknown): size is number => typeof size === 'number' && Number.isFinite(size) && size >= 0;
	if (!ids.size || ids.size > 256 || !ids.has(value.active)
		|| !('orientation' in grid) || (grid.orientation !== Orientation.HORIZONTAL && grid.orientation !== Orientation.VERTICAL)
		|| !('width' in grid) || !finiteSize(grid.width) || !('height' in grid) || !finiteSize(grid.height)
		|| !('root' in grid)) {
		return false;
	}
	let count = 0;
	let maximized = 0;
	const leaves = new Set<string>();
	const validNode = (node: unknown, depth: number): boolean => {
		if (++count > 1024 || depth > 32 || !node || typeof node !== 'object'
			|| !('size' in node) || !finiteSize(node.size) || !('type' in node) || !('data' in node)
			|| ('visible' in node && typeof node.visible !== 'boolean')) {
			return false;
		}
		if (node.type === 'branch') {
			return Array.isArray(node.data) && node.data.length > 0 && node.data.every(child => validNode(child, depth + 1));
		}
		if (depth === 0 || node.type !== 'leaf' || !isSessionGridLeafData(node.data) || !ids.has(node.data.id) || leaves.has(node.data.id)) {
			return false;
		}
		if ('maximized' in node) {
			if (typeof node.maximized !== 'boolean' || (node.maximized && ++maximized > 1)) {
				return false;
			}
		}
		leaves.add(node.data.id);
		return true;
	};
	return validNode(grid.root, 0) && leaves.size === ids.size;
}

/** Remap or prune unavailable bindings without inverting branch orientation. */
export function projectSessionGrid(grid: ISerializedGrid, map: (id: string) => string | undefined): ISerializedGrid | undefined {
	const leaves = new Map<string, ISerializedLeafNode>();
	const project = (node: ISerializedNode): ISerializedNode | undefined => {
		if (node.type === 'leaf') {
			if (!isSessionGridLeafData(node.data)) {
				throw new Error('Invalid session grid leaf');
			}
			const id = map(node.data.id);
			if (id === undefined) {
				return undefined;
			}
			const existing = leaves.get(id);
			if (existing) {
				if (node.maximized) {
					existing.maximized = true;
				}
				return undefined;
			}
			const leaf: ISerializedLeafNode = { ...node, data: { id } };
			delete leaf.visible;
			leaves.set(id, leaf);
			return leaf;
		}
		const data = node.data.map(project).filter(node => node !== undefined);
		const branch = { ...node, data };
		delete branch.visible;
		return data.length ? branch : undefined;
	};
	const root = project(grid.root);
	if (!root) {
		return undefined;
	}
	const normalize = (node: ISerializedNode): ISerializedNode => {
		if (node.type === 'leaf') {
			return node;
		}
		const data: ISerializedNode[] = [];
		for (const child of node.data.map(normalize)) {
			// GridView cannot remove the last child of a non-root branch.
			if (child.type === 'branch' && child.data.length === 1) {
				const only = child.data[0];
				if (only.type === 'branch') {
					const total = only.data.reduce((sum, node) => sum + node.size, 0);
					data.push(...only.data.map(node => ({ ...node, size: total ? node.size * child.size / total : child.size / only.data.length })));
				} else {
					data.push({ ...only, size: child.size });
				}
			} else {
				data.push(child);
			}
		}
		return { ...node, data };
	};
	return { ...grid, root: normalize(root) };
}
