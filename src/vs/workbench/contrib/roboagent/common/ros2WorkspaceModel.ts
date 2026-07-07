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
 * REQ-1 populates this from build files (package.xml, CMakeLists.txt, setup.py).
 * REQ-2 adds the communication model (publishers/subscribers/services/actions/
 * parameters) by statically scanning node source. Live runtime introspection is
 * a later requirement.
 */

export type Ros2BuildType = 'ament_cmake' | 'ament_python' | 'cmake' | 'unknown';

export type Ros2NodeLanguage = 'cpp' | 'python' | 'unknown';

export type Ros2InterfaceKind = 'msg' | 'srv' | 'action';

export type Ros2LaunchFormat = 'python' | 'xml' | 'yaml';

/** The direction/role of a node's communication endpoint. */
export type Ros2CommKind =
	| 'publisher'
	| 'subscriber'
	| 'service_server'
	| 'service_client'
	| 'action_server'
	| 'action_client';

/** Uniquely identifies a node (executable) within the workspace. */
export function nodeKey(pkg: string, name: string): string {
	return `${pkg}/${name}`;
}

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

/** A single communication endpoint of a node, found by scanning its source. */
export interface Ros2Communication {
	readonly package: string;
	/** The owning node (executable) name. */
	readonly node: string;
	readonly kind: Ros2CommKind;
	/** Topic / service / action name (e.g. `/cmd_vel`). */
	readonly name: string;
	/** Message/service/action type, best-effort (e.g. `geometry_msgs/Twist` or `Twist`). */
	readonly messageType?: string;
}

/** A parameter declared by a node. */
export interface Ros2Parameter {
	readonly package: string;
	readonly node: string;
	readonly name: string;
}

/** A topic aggregated across the workspace from publisher/subscriber endpoints. */
export interface Ros2Topic {
	readonly name: string;
	readonly messageType?: string;
	/** Node keys (see {@link nodeKey}) that publish to this topic. */
	readonly publishers: readonly string[];
	/** Node keys that subscribe to this topic. */
	readonly subscribers: readonly string[];
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
	readonly communications: readonly Ros2Communication[];
	readonly parameters: readonly Ros2Parameter[];
	readonly topics: readonly Ros2Topic[];
	/** When the graph was last (re)built, ms since epoch. 0 when never indexed. */
	readonly indexedAt: number;
}

export const EMPTY_ROS2_GRAPH: Ros2WorkspaceGraph = {
	workspaces: [],
	packages: [],
	nodes: [],
	interfaces: [],
	launchFiles: [],
	communications: [],
	parameters: [],
	topics: [],
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

/** Communication endpoints of a specific node. */
export function communicationsForNode(graph: Ros2WorkspaceGraph, packageName: string, nodeName: string): Ros2Communication[] {
	return graph.communications.filter(c => c.package === packageName && c.node === nodeName);
}

/** Parameters declared by a specific node. */
export function parametersForNode(graph: Ros2WorkspaceGraph, packageName: string, nodeName: string): Ros2Parameter[] {
	return graph.parameters.filter(p => p.package === packageName && p.node === nodeName);
}

/**
 * Aggregate publisher/subscriber endpoints into a topic registry. Later
 * requirements (graph visualization, debugging) consume this to reason about
 * which nodes talk to each other.
 */
export function buildTopicRegistry(communications: readonly Ros2Communication[]): Ros2Topic[] {
	const byTopic = new Map<string, { messageType?: string; publishers: Set<string>; subscribers: Set<string> }>();
	for (const c of communications) {
		if (c.kind !== 'publisher' && c.kind !== 'subscriber') {
			continue;
		}
		let entry = byTopic.get(c.name);
		if (!entry) {
			entry = { messageType: c.messageType, publishers: new Set(), subscribers: new Set() };
			byTopic.set(c.name, entry);
		}
		if (!entry.messageType && c.messageType) {
			entry.messageType = c.messageType;
		}
		(c.kind === 'publisher' ? entry.publishers : entry.subscribers).add(nodeKey(c.package, c.node));
	}
	return Array.from(byTopic.entries())
		.map(([name, e]): Ros2Topic => ({ name, messageType: e.messageType, publishers: [...e.publishers], subscribers: [...e.subscribers] }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
