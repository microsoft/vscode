/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { getSnapshotKey, importerDependencyKinds, parsePackageKey, snapshotDependencyKinds, type PnpmLockfile } from './pnpmLock.ts';

/**
 * Computes the `node_modules` layout that pnpm's hoisted linker (`nodeLinker: hoisted`) installs
 * for a lockfile, without installing it: the folders of each package, relative to the install root.
 *
 * The product ships its dependencies in that layout. Computing it from the lockfile lets the build
 * package the same layout whichever linker installed the dependencies: with the isolated linker,
 * the packages are in pnpm's virtual store instead.
 *
 * pnpm (`real-hoist`) hoists with a port of the hoister of Yarn's node-modules linker
 * (`@yarnpkg/nm`). This is a port of that hoister, reduced to what pnpm uses, plus the rules that
 * reproduce pnpm's results on this repository's lockfiles: the dependencies of an importer are taken
 * in name order, the provider of a peer is the nearest ancestor that depends on it, a dependency
 * whose peer is the package that it is nested in stays nested, and dependencies whose peers can only
 * be hoisted together with each other (a peer cycle, such as `webpack` and `webpack-cli`) stay where
 * they are. `build/lib/dependencies.ts` compares the result with the
 * locations that pnpm recorded when the hoisted linker installed the dependencies.
 */

/** A dependency in the input tree: one per (dependency name, snapshot) pair. */
interface IInputNode {
	readonly name: string;
	/** The real package name (different from `name` for npm aliases). */
	readonly identName: string;
	/** The snapshot key, or the `link:`/`workspace:` reference of a project. */
	readonly reference: string;
	readonly isWorkspace: boolean;
	readonly peerNames: ReadonlySet<string>;
	dependencies: IInputNode[];
}

/** A node of the tree that the hoister rearranges. */
interface IWorkNode {
	readonly name: string;
	readonly identName: string;
	readonly reference: string;
	readonly ident: string;
	readonly isWorkspace: boolean;
	readonly peerNames: ReadonlySet<string>;
	dependencies: Map<string, IWorkNode>;
	originalDependencies: Map<string, IWorkNode>;
	hoistedDependencies: Map<string, IWorkNode>;
	decoupled: boolean;
}

/** Whether a dependency can be hoisted: `depends` when only together with the peers in `dependsOn`. */
type HoistInfo = { readonly state: 'yes' | 'no' } | { readonly state: 'depends'; readonly dependsOn: ReadonlySet<IWorkNode> };

function buildInputTree(lockfile: PnpmLockfile): IInputNode {
	const nodes = new Map<string, IInputNode>();
	const toNodes = (dependencies: readonly (readonly [string, string])[]): IInputNode[] => dependencies.map(([name, version]) => {
		const key = getSnapshotKey(name, version);
		if (!key) {
			// A `link:` dependency on another project of the workspace.
			const linkKey = `${name}:${version}`;
			let node = nodes.get(linkKey);
			if (!node) {
				node = { name, identName: name, reference: version, isWorkspace: true, peerNames: new Set(), dependencies: [] };
				nodes.set(linkKey, node);
			}
			return node;
		}
		const nodeKey = `${name}:${key}`;
		let node = nodes.get(nodeKey);
		if (!node) {
			const { name: identName, version: packageVersion } = parsePackageKey(key);
			const snapshot = lockfile.snapshots?.[key];
			const peerDependencies = lockfile.packages?.[`${identName}@${packageVersion}`]?.peerDependencies;
			node = {
				name,
				identName,
				reference: key,
				isWorkspace: false,
				peerNames: new Set([...Object.keys(peerDependencies ?? {}), ...(snapshot?.transitivePeerDependencies ?? [])]),
				dependencies: [],
			};
			nodes.set(nodeKey, node);
			const snapshotDependencies = new Map<string, string>();
			for (const kind of snapshotDependencyKinds) {
				for (const [dependencyName, dependencyVersion] of Object.entries(snapshot?.[kind] ?? {})) {
					snapshotDependencies.set(dependencyName, dependencyVersion);
				}
			}
			node.dependencies = toNodes([...snapshotDependencies]);
		}
		return node;
	});
	const importerDependencies = (importerId: string): (readonly [string, string])[] => {
		const importer = lockfile.importers[importerId];
		const dependencies = new Map<string, string>();
		for (const kind of importerDependencyKinds) {
			for (const [name, { version }] of Object.entries(importer?.[kind] ?? {})) {
				dependencies.set(name, version);
			}
		}
		return [...dependencies].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
	};

	const root: IInputNode = { name: '.', identName: '.', reference: '', isWorkspace: true, peerNames: new Set(), dependencies: toNodes(importerDependencies('.')) };
	for (const importerId of Object.keys(lockfile.importers)) {
		if (importerId !== '.') {
			const name = encodeURIComponent(importerId);
			root.dependencies.push({ name, identName: name, reference: `workspace:${importerId}`, isWorkspace: true, peerNames: new Set(), dependencies: toNodes(importerDependencies(importerId)) });
		}
	}
	return root;
}

function createWorkNode(node: IInputNode): IWorkNode {
	return {
		name: node.name,
		identName: node.identName,
		reference: node.reference,
		ident: `${node.identName}@${node.reference}`,
		isWorkspace: node.isWorkspace,
		peerNames: node.peerNames,
		dependencies: new Map(),
		originalDependencies: new Map(),
		hoistedDependencies: new Map(),
		decoupled: true,
	};
}

/**
 * Copies the input tree. A package that several packages depend on is one node, shared until the
 * hoister changes it for one of them (see {@link decouple}).
 */
function cloneTree(tree: IInputNode): IWorkNode {
	const root = createWorkNode(tree);
	const seen = new Map<IInputNode, IWorkNode>([[tree, root]]);
	const markCoupled = (node: IWorkNode, marked: Set<IWorkNode>) => {
		if (marked.has(node)) {
			return;
		}
		marked.add(node);
		node.decoupled = false;
		for (const dependency of node.dependencies.values()) {
			if (!node.peerNames.has(dependency.name)) {
				markCoupled(dependency, marked);
			}
		}
	};
	const add = (node: IInputNode, parent: IWorkNode) => {
		let workNode = seen.get(node);
		const isSeen = !!workNode;
		if (!workNode) {
			workNode = createWorkNode(node);
			seen.set(node, workNode);
		}
		parent.dependencies.set(node.name, workNode);
		parent.originalDependencies.set(node.name, workNode);
		if (!isSeen) {
			for (const dependency of node.dependencies) {
				add(dependency, workNode);
			}
		} else {
			markCoupled(workNode, new Set());
		}
	};
	for (const dependency of tree.dependencies) {
		add(dependency, root);
	}
	return root;
}

function aliasedIdent(node: IWorkNode): string {
	return node.name === node.identName ? node.ident : `${node.name}@${node.ident}`;
}

/**
 * Gives `parent` its own copy of `node`, so that hoisting the dependencies of `node` for `parent`
 * doesn't change it for the other packages that depend on it.
 */
function decouple(parent: IWorkNode, node: IWorkNode): IWorkNode {
	if (node.decoupled) {
		return node;
	}
	const clone: IWorkNode = {
		...node,
		dependencies: new Map(node.dependencies),
		originalDependencies: new Map(node.originalDependencies),
		hoistedDependencies: new Map(node.hoistedDependencies),
		decoupled: true,
	};
	const self = clone.dependencies.get(clone.name);
	if (self && self.ident === clone.ident) {
		clone.dependencies.set(clone.name, clone);
	}
	parent.dependencies.set(clone.name, clone);
	return clone;
}

/**
 * Returns the dependencies of `node` that aren't its peers, each after the peers that it shares
 * with `node`'s dependencies.
 */
function getSortedRegularDependencies(node: IWorkNode): Set<IWorkNode> {
	const result = new Set<IWorkNode>();
	const add = (dependency: IWorkNode, seen: Set<IWorkNode>) => {
		if (seen.has(dependency)) {
			return;
		}
		seen.add(dependency);
		for (const peerName of dependency.peerNames) {
			if (!node.peerNames.has(peerName)) {
				const peer = node.dependencies.get(peerName);
				if (peer && !result.has(peer)) {
					add(peer, seen);
				}
			}
		}
		result.add(dependency);
	};
	for (const dependency of node.dependencies.values()) {
		if (!node.peerNames.has(dependency.name)) {
			add(dependency, new Set());
		}
	}
	return result;
}

/**
 * Returns, for each name, the idents that may take that name in the `node_modules` of `root`, the
 * most used first.
 */
function getHoistIdentMap(root: IWorkNode): Map<string, string[]> {
	const preferences = new Map<string, { dependents: Set<string>; peerDependents: Set<string> }>();
	const seen = new Set<IWorkNode>([root]);
	const entry = (node: IWorkNode) => {
		const key = `${node.name}@${node.ident}`;
		let result = preferences.get(key);
		if (!result) {
			result = { dependents: new Set(), peerDependents: new Set() };
			preferences.set(key, result);
		}
		return result;
	};
	const addDependent = (dependent: IWorkNode, node: IWorkNode) => {
		const isSeen = seen.has(node);
		entry(node).dependents.add(dependent.ident);
		if (!isSeen) {
			seen.add(node);
			for (const dependency of node.dependencies.values()) {
				const dependencyEntry = entry(dependency);
				if (node.peerNames.has(dependency.name)) {
					dependencyEntry.peerDependents.add(node.ident);
				} else {
					addDependent(node, dependency);
				}
			}
		}
	};
	for (const dependency of root.dependencies.values()) {
		if (!root.peerNames.has(dependency.name)) {
			addDependent(root, dependency);
		}
	}

	const result = new Map<string, string[]>([[root.name, [root.ident]]]);
	for (const dependency of root.dependencies.values()) {
		if (!root.peerNames.has(dependency.name)) {
			result.set(dependency.name, [dependency.ident]);
		}
	}
	const usages = (key: string) => preferences.get(key)!.dependents.size + preferences.get(key)!.peerDependents.size;
	const keys = [...preferences.keys()].sort((a, b) => usages(b) - usages(a));
	for (const key of keys) {
		const name = key.substring(0, key.indexOf('@', 1));
		const ident = key.substring(name.length + 1);
		if (!root.peerNames.has(name)) {
			let idents = result.get(name);
			if (!idents) {
				idents = [];
				result.set(name, idents);
			}
			if (!idents.includes(ident)) {
				idents.push(ident);
			}
		}
	}
	return result;
}

/** Returns the packages that the packages below `rootPath`'s last node expect from it, before any round. */
function getZeroRoundUsedDependencies(rootPath: readonly IWorkNode[]): Map<string, IWorkNode> {
	const result = new Map<string, IWorkNode>();
	const seen = new Set<IWorkNode>();
	const add = (node: IWorkNode) => {
		if (seen.has(node)) {
			return;
		}
		seen.add(node);
		for (const dependency of node.hoistedDependencies.values()) {
			result.set(dependency.name, dependency);
		}
		for (const dependency of node.dependencies.values()) {
			if (!node.peerNames.has(dependency.name)) {
				add(dependency);
			}
		}
	};
	add(rootPath[rootPath.length - 1]);
	return result;
}

/** Returns the packages that the packages below `rootPath`'s last node resolve through the nodes of `rootPath`. */
function getUsedDependencies(rootPath: readonly IWorkNode[]): Map<string, IWorkNode> {
	const result = new Map<string, IWorkNode>();
	const seen = new Set<IWorkNode>();
	const add = (node: IWorkNode, hiddenNames: ReadonlySet<string>) => {
		if (seen.has(node)) {
			return;
		}
		seen.add(node);
		for (const dependency of node.hoistedDependencies.values()) {
			if (!hiddenNames.has(dependency.name)) {
				for (const pathNode of rootPath) {
					const reachable = pathNode.dependencies.get(dependency.name);
					if (reachable) {
						result.set(reachable.name, reachable);
					}
				}
			}
		}
		const childHiddenNames = new Set(node.dependencies.keys());
		for (const dependency of node.dependencies.values()) {
			if (!node.peerNames.has(dependency.name)) {
				add(dependency, childHiddenNames);
			}
		}
	};
	add(rootPath[rootPath.length - 1], new Set());
	return result;
}

function getHoistInfo(root: IWorkNode, nodePath: readonly IWorkNode[], node: IWorkNode, usedDependencies: ReadonlyMap<string, IWorkNode>, hoistIdents: ReadonlyMap<string, string>, shadowedNodes: Map<IWorkNode, Set<string>>, fastLookup: boolean): HoistInfo {
	const parent = nodePath[nodePath.length - 1];
	let isHoistable = node.ident !== parent.ident && !node.isWorkspace && !root.peerNames.has(node.name);

	if (isHoistable) {
		const used = usedDependencies.get(node.name);
		let isNameAvailable = !used || used.ident === node.ident;
		if (isNameAvailable) {
			for (let index = nodePath.length - 1; index >= 1; index--) {
				const dependency = nodePath[index].dependencies.get(node.name);
				if (dependency && dependency.ident !== node.ident) {
					isNameAvailable = false;
					let shadowed = shadowedNodes.get(parent);
					if (!shadowed) {
						shadowed = new Set();
						shadowedNodes.set(parent, shadowed);
					}
					shadowed.add(node.name);
					break;
				}
			}
		}
		isHoistable = isNameAvailable;
	}

	if (isHoistable) {
		isHoistable = hoistIdents.get(node.name) === node.ident;
	}

	let dependsOn: Set<IWorkNode> | undefined = new Set();
	if (isHoistable) {
		const unresolvedPeers = new Set(node.peerNames);
		for (let index = nodePath.length - 1; index >= 1 && isHoistable; index--) {
			const pathNode = nodePath[index];
			for (const peerName of unresolvedPeers) {
				if (pathNode.peerNames.has(peerName) && pathNode.originalDependencies.has(peerName)) {
					continue;
				}
				// A package whose peer is the package that it is nested in can't leave it.
				if (pathNode.name === peerName && !pathNode.isWorkspace && root.dependencies.get(peerName) !== pathNode) {
					dependsOn = undefined;
					isHoistable = false;
					break;
				}
				// Like pnpm's hoister, look for the provider of the peer up the ancestors: the nearest
				// one that has it as a dependency (`@yarnpkg/nm` looks only at the parent).
				const provider = pathNode.dependencies.get(peerName);
				if (!provider) {
					continue;
				}
				if (root.dependencies.get(peerName) !== provider) {
					if (index === nodePath.length - 1) {
						dependsOn!.add(provider);
					} else {
						dependsOn = undefined;
						isHoistable = false;
						break;
					}
				}
				unresolvedPeers.delete(peerName);
			}
		}
	}

	if (isHoistable && !fastLookup) {
		for (const dependency of node.hoistedDependencies.values()) {
			const used = usedDependencies.get(dependency.name) || root.dependencies.get(dependency.name);
			if (!used || dependency.ident !== used.ident) {
				isHoistable = false;
				break;
			}
		}
	}

	if (dependsOn && dependsOn.size > 0) {
		return { state: 'depends', dependsOn };
	}
	return { state: isHoistable ? 'yes' : 'no' };
}

function hoistGraph(rootPath: readonly IWorkNode[], usedDependencies: ReadonlyMap<string, IWorkNode>, hoistIdents: ReadonlyMap<string, string>, parentShadowedNodes: ReadonlyMap<IWorkNode, Set<string>>, shadowedNodes: Map<IWorkNode, Set<string>>, fastLookup: boolean): { anotherRoundNeeded: boolean; isGraphChanged: boolean } {
	const root = rootPath[rootPath.length - 1];
	const seen = new Set<IWorkNode>();
	let anotherRoundNeeded = false;
	let isGraphChanged = false;
	let nextNewNodes = new Set<IWorkNode>();

	const hoistNodeDependencies = (nodePath: readonly IWorkNode[], aliasedPath: readonly string[], parent: IWorkNode) => {
		if (seen.has(parent)) {
			return;
		}
		const nextAliasedPath = [...aliasedPath, aliasedIdent(parent)];
		const dependants = new Map<string, Set<string>>();
		const infos = new Map<IWorkNode, HoistInfo>();
		for (const dependency of getSortedRegularDependencies(parent)) {
			const info = getHoistInfo(root, [root, ...nodePath, parent], dependency, usedDependencies, hoistIdents, shadowedNodes, fastLookup);
			infos.set(dependency, info);
			if (info.state === 'depends') {
				for (const peer of info.dependsOn) {
					let names = dependants.get(peer.name);
					if (!names) {
						names = new Set();
						dependants.set(peer.name, names);
					}
					names.add(dependency.name);
				}
			}
		}

		// A dependency that depends on others being hoisted with it is hoisted only when they all
		// are: a cycle of such dependencies stays.
		const hoisted = new Set([...infos].filter(([, info]) => info.state === 'yes').map(([node]) => node));
		for (let changed = true; changed;) {
			changed = false;
			for (const [node, info] of infos) {
				if (info.state === 'depends' && !hoisted.has(node) && [...info.dependsOn].every(peer => hoisted.has(peer))) {
					hoisted.add(node);
					changed = true;
				}
			}
		}
		const unhoistable = new Set<IWorkNode>();
		const addUnhoistable = (node: IWorkNode) => {
			if (!unhoistable.has(node)) {
				unhoistable.add(node);
				for (const name of dependants.get(node.name) ?? []) {
					addUnhoistable(parent.dependencies.get(name)!);
				}
			}
		};
		for (const node of infos.keys()) {
			if (!hoisted.has(node)) {
				addUnhoistable(node);
			}
		}

		for (const node of infos.keys()) {
			if (!unhoistable.has(node)) {
				isGraphChanged = true;
				if (parentShadowedNodes.get(parent)?.has(node.name)) {
					anotherRoundNeeded = true;
				}
				parent.dependencies.delete(node.name);
				parent.hoistedDependencies.set(node.name, node);
				if (!root.dependencies.has(node.name) && root.ident !== node.ident) {
					root.dependencies.set(node.name, node);
					nextNewNodes.add(node);
				}
			}
		}

		for (const node of getSortedRegularDependencies(parent)) {
			if (unhoistable.has(node) && !nextAliasedPath.includes(aliasedIdent(node))) {
				seen.add(parent);
				hoistNodeDependencies([...nodePath, parent], nextAliasedPath, decouple(parent, node));
				seen.delete(parent);
			}
		}
	};

	nextNewNodes = new Set(getSortedRegularDependencies(root));
	const aliasedRootPath = rootPath.map(aliasedIdent);
	while (nextNewNodes.size > 0) {
		const newNodes = nextNewNodes;
		nextNewNodes = new Set();
		for (const dependency of newNodes) {
			if (dependency.ident !== root.ident) {
				hoistNodeDependencies([], aliasedRootPath, decouple(root, dependency));
			}
		}
	}
	return { anotherRoundNeeded, isGraphChanged };
}

function hoistTo(tree: IWorkNode, rootPath: readonly IWorkNode[], rootPathIdents: Set<string>, parentShadowedNodes: ReadonlyMap<IWorkNode, Set<string>>, fastLookup: boolean): { anotherRoundNeeded: boolean; isGraphChanged: boolean } {
	const root = rootPath[rootPath.length - 1];
	const hoistIdentMap = getHoistIdentMap(root);
	const usedDependencies = tree === root ? new Map<string, IWorkNode>() : fastLookup ? getZeroRoundUsedDependencies(rootPath) : getUsedDependencies(rootPath);
	const hoistIdents = new Map([...hoistIdentMap].map(([name, idents]) => [name, idents[0]]));
	const shadowedNodes = new Map<IWorkNode, Set<string>>();
	let anotherRoundNeeded = false;
	let isGraphChanged = false;
	for (let stateChanged = true; stateChanged;) {
		const result = hoistGraph(rootPath, usedDependencies, hoistIdents, parentShadowedNodes, shadowedNodes, fastLookup);
		anotherRoundNeeded ||= result.anotherRoundNeeded;
		isGraphChanged ||= result.isGraphChanged;
		stateChanged = false;
		for (const [name, idents] of hoistIdentMap) {
			if (idents.length > 1 && !root.dependencies.has(name)) {
				idents.shift();
				hoistIdents.set(name, idents[0]);
				stateChanged = true;
			}
		}
	}
	for (const dependency of root.dependencies.values()) {
		if (!root.peerNames.has(dependency.name) && !rootPathIdents.has(dependency.ident)) {
			rootPathIdents.add(dependency.ident);
			const result = hoistTo(tree, [...rootPath, dependency], rootPathIdents, shadowedNodes, fastLookup);
			anotherRoundNeeded ||= result.anotherRoundNeeded;
			isGraphChanged ||= result.isGraphChanged;
			rootPathIdents.delete(dependency.ident);
		}
	}
	return { anotherRoundNeeded, isGraphChanged };
}

/**
 * Returns the folders where pnpm's hoisted linker installs each package of `lockfile`, by snapshot
 * key, as POSIX paths relative to the install root (for example `node_modules/a/node_modules/b`).
 * `skipped` are the snapshot keys of the optional packages that pnpm didn't install (`skipped` in
 * `node_modules/.modules.yaml`).
 */
export function getHoistedLocations(lockfile: PnpmLockfile, skipped: ReadonlySet<string>): Map<string, string[]> {
	const tree = cloneTree(buildInputTree(lockfile));
	for (let fastLookup = true; ; fastLookup = false) {
		const result = hoistTo(tree, [tree], new Set([tree.ident]), new Map(), fastLookup);
		if (!result.anotherRoundNeeded && !result.isGraphChanged) {
			break;
		}
	}

	const result = new Map<string, string[]>();
	const place = (node: IWorkNode, nodeModules: string, onPath: Set<IWorkNode>) => {
		if (onPath.has(node)) {
			return;
		}
		onPath.add(node);
		for (const dependency of node.dependencies.values()) {
			if (node.peerNames.has(dependency.name)) {
				continue;
			}
			if (dependency.reference.startsWith('workspace:')) {
				place(dependency, path.posix.join(dependency.reference.substring('workspace:'.length), 'node_modules'), onPath);
				continue;
			}
			if (dependency.isWorkspace || !lockfile.snapshots?.[dependency.reference] || skipped.has(dependency.reference)) {
				continue;
			}
			const location = path.posix.join(nodeModules, dependency.name);
			let locations = result.get(dependency.reference);
			if (!locations) {
				locations = [];
				result.set(dependency.reference, locations);
			}
			if (!locations.includes(location)) {
				locations.push(location);
			}
			place(dependency, path.posix.join(location, 'node_modules'), onPath);
		}
		onPath.delete(node);
	};
	place(tree, 'node_modules', new Set());
	return result;
}
