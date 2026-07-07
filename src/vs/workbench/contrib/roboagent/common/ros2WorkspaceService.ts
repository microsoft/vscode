/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Ros2WorkspaceGraph } from './ros2WorkspaceModel.js';

export const IRos2WorkspaceService = createDecorator<IRos2WorkspaceService>('ros2WorkspaceService');

/**
 * Builds and holds the RoboAgent Workspace Knowledge Graph (WKG) for the open
 * colcon/ROS2 workspace(s). Re-indexes on demand and when relevant build files
 * change.
 */
export interface IRos2WorkspaceService {
	readonly _serviceBrand: undefined;

	/** Fires whenever the graph is rebuilt (including the initial index). */
	readonly onDidChangeGraph: Event<void>;

	/** The current knowledge graph snapshot. Never `undefined`; empty before first index. */
	getGraph(): Ros2WorkspaceGraph;

	/** True while an indexing pass is in flight. */
	readonly isIndexing: boolean;

	/** Rebuild the knowledge graph from the current workspace. Resolves when done. */
	indexWorkspace(): Promise<void>;
}
