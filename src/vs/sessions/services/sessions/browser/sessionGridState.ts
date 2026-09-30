/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISerializedGrid, ISerializedLeafNode, ISerializedNode } from '../../../../base/browser/ui/grid/grid.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { URI } from '../../../../base/common/uri.js';

export interface ISessionGridState {
	readonly version: 1;
	readonly grid: ISerializedGrid;
	readonly sessions: readonly { readonly id: string; readonly resource?: string; readonly sticky: boolean }[];
	readonly active: string;
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
	return root ? { ...grid, root } : undefined;
}
