/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IObservable } from 'vs/base/common/observable';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IFlowGraphData } from 'vs/workbench/contrib/flowEditor/common/flowEditorTypes';

export const IFlowGraphService = createDecorator<IFlowGraphService>('flowGraphService');

export interface IFlowGraphService {
	readonly _serviceBrand: undefined;

	getGraphs(): Promise<IFlowGraph[]>;
	getGraph(uri: URI): Promise<IFlowGraph>;
}

export interface IFlowGraph {
	/**
	 * Canonical URI of the flow graph.
	 */
	readonly uri: URI;

	/**
	 * URI where the graph is stored.
	 */
	readonly fileUri: URI;

	/**
	 * Nodes in the graph. Note: gettable, settable, and changes apply in
	 * real-time to the workspace.
	 */
	data: IObservable<IFlowGraphData>;

	/**
	 * Updates the stored graph.
	 */
	replace(graph: IFlowGraphData): Promise<void>;

	/**
	 * Starts the graph running.
	 */
	run(token: CancellationToken): void;
}
