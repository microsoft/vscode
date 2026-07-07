/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * The RoboAgent Workspace Knowledge Graph (WKG) — an in-memory model of a ROS2 /
 * colcon workspace. This is the foundation the AI context engine, graph
 * visualization and debugging agents build on top of.
 *
 * REQ-1 populates this from build files only (package.xml, CMakeLists.txt,
 * setup.py); deep source-level introspection (publishers/subscribers/services)
 * and live runtime introspection are later requirements.
 */

export type Ros2BuildType = 'ament_cmake' | 'ament_python' | 'cmake' | 'unknown';

export type Ros2NodeLanguage = 'cpp' | 'python' | 'unknown';

export type Ros2InterfaceKind = 'msg' | 'srv' | 'action';

export type Ros2LaunchFormat = 'python' | 'xml' | 'yaml';

/** A detected colcon workspace root (a folder containing a `src/` of packages, or packages directly). */
export interface Ros2Workspace {
	readonly rootUri: URI;
	readonly name: string;
}

export interface Ros2PackageDependencies {
	readonly build: readonly string[];
	readonly exec: readonly string[];
	readonly test: readonly string[];
}

/** A ROS2 package parsed from its `package.xml` and build files. */
export interface Ros2Package {
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly maintainers: readonly string[];
	readonly buildType: Ros2BuildType;
	/** Directory of the package (the folder containing `package.xml`). */
	readonly path: URI;
	readonly packageXmlUri: URI;
	readonly dependencies: Ros2PackageDependencies;
	/** True when the package declares itself a member of `rosidl_interface_packages`. */
	readonly isInterfacePackage: boolean;
}

/** An executable / entry-point node, derived from CMakeLists.txt or setup.py. */
export interface Ros2Node {
	readonly name: string;
	readonly package: string;
	readonly language: Ros2NodeLanguage;
	/** Best-effort hint at the source module/target, e.g. `my_pkg.talker:main`. */
	readonly sourceHint?: string;
}

/** A message / service / action interface definition file. */
export interface Ros2Interface {
	readonly package: string;
	readonly kind: Ros2InterfaceKind;
	readonly name: string;
	readonly path: URI;
}

/** A launch file discovered in a package. */
export interface Ros2LaunchFile {
	readonly package: string;
	readonly path: URI;
	readonly format: Ros2LaunchFormat;
}

/** The complete workspace knowledge graph. All arrays are immutable snapshots. */
export interface Ros2WorkspaceGraph {
	readonly workspaces: readonly Ros2Workspace[];
	readonly packages: readonly Ros2Package[];
	readonly nodes: readonly Ros2Node[];
	readonly interfaces: readonly Ros2Interface[];
	readonly launchFiles: readonly Ros2LaunchFile[];
	/** When the graph was last (re)built, ms since epoch. 0 when never indexed. */
	readonly indexedAt: number;
}

export const EMPTY_ROS2_GRAPH: Ros2WorkspaceGraph = {
	workspaces: [],
	packages: [],
	nodes: [],
	interfaces: [],
	launchFiles: [],
	indexedAt: 0
};

export function isEmptyGraph(graph: Ros2WorkspaceGraph): boolean {
	return graph.packages.length === 0;
}

/** Nodes belonging to a package. */
export function nodesForPackage(graph: Ros2WorkspaceGraph, packageName: string): Ros2Node[] {
	return graph.nodes.filter(n => n.package === packageName);
}

/** Interfaces belonging to a package. */
export function interfacesForPackage(graph: Ros2WorkspaceGraph, packageName: string): Ros2Interface[] {
	return graph.interfaces.filter(i => i.package === packageName);
}

/** Launch files belonging to a package. */
export function launchFilesForPackage(graph: Ros2WorkspaceGraph, packageName: string): Ros2LaunchFile[] {
	return graph.launchFiles.filter(l => l.package === packageName);
}
