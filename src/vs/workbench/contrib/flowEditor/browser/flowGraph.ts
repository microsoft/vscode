/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { autorun, observableValue } from 'vs/base/common/observable';
import { ISettableObservable, transaction } from 'vs/base/common/observableInternal/base';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogger } from 'vs/platform/log/common/log';
import { runGraphNode } from 'vs/workbench/contrib/flowEditor/browser/graphRunners';
import { IActualizedNode, IFlowGraphData, IFlowNode } from 'vs/workbench/contrib/flowEditor/common/flowEditorTypes';
import { IFlowGraph } from 'vs/workbench/contrib/flowEditor/common/flowGraphService';


export class FlowGraph implements IFlowGraph {
	public readonly uri = this.fileUri.with({ scheme: Schemas.vscodeFlow });
	public readonly data: ISettableObservable<IFlowGraphData>;

	constructor(
		data: IFlowGraphData,
		public readonly fileUri: URI,
		private readonly logger: ILogger,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		this.data = observableValue('flowData', data);
	}

	public async replace(graph: IFlowGraphData): Promise<void> {
		await this.fileService.writeFile(
			this.fileUri,
			VSBuffer.fromString(JSON.stringify(graph, null, 2)),
		);
		this.data.set(graph, undefined);
	}

	public run(token: CancellationToken): void {
		const ds = new DisposableStore();
		const storeForRuns = ds.add(new DisposableStore());
		ds.add(token.onCancellationRequested(() => ds.dispose()));
		ds.add(autorun(reader => {
			const nodeMap = new Map<number, GraphNode>();
			const nodes = this.data.read(reader).nodes;
			this.logger.info(`Running flow graph from ${this.uri} with ${nodes.length} nodes`);

			for (const node of nodes) {
				nodeMap.set(node.id, new GraphNode(node, this, this.logger));
			}

			for (const node of nodeMap.values()) {
				for (const input of node.actualized.inputs || []) {
					if (!input) {
						// never fired:
						const cnx = new GraphConnection();
						node.incoming.push(cnx);
					} else {
						const fromN = nodeMap.get(input.sourceId)!;
						const connection = new GraphConnection();
						connection.resetAfterFiring = !!fromN.actualized.resetOutputAfterFire;
						(fromN.outgoing[input.sourceIndex] ??= []).push(connection);
						node.incoming.push(connection);
					}
				}
			}

			storeForRuns.clear();
			for (const node of nodeMap.values()) {
				node.run(storeForRuns, this.instantiationService, token);
			}
		}));
	}
}

const Unset = Symbol('Unset');

class GraphConnection {
	public data = observableValue<any>('connectionData', Unset);
	public resetAfterFiring = false;
}

const enum NodeState {
	Waiting,
	Running,
}

class GraphNode {
	public state = observableValue('graphNode', NodeState.Waiting);
	public incoming: GraphConnection[] = [];
	public outgoing: GraphConnection[][] = [];
	public readonly actualized = IActualizedNode.create(this.node.node);

	private runWhenDoneWithInput?: any[];

	constructor(
		public readonly node: IFlowNode,
		private readonly graph: IFlowGraph,
		private readonly logger: ILogger,
	) { }

	public run(store: DisposableStore, instantiationService: IInstantiationService, token: CancellationToken): void {
		const runStore = store.add(new DisposableStore());
		store.add(token.onCancellationRequested(() => runStore.dispose()));
		store.add(autorun(async reader => {
			const input = this.incoming.map(c => c.data.read(reader));
			if (input.some(v => v === Unset)) {
				return;
			}

			runStore.clear();
			this.doRun(runStore, instantiationService, token, input);

			transaction(tx => {
				for (const incoming of this.incoming) {
					if (incoming.resetAfterFiring) {
						incoming.data.set(Unset, tx);
					}
				}
			});
		}));
	}

	private async doRun(store: DisposableStore, instantiationService: IInstantiationService, token: CancellationToken, input: any[]) {
		if (this.state.get() === NodeState.Running) {
			this.runWhenDoneWithInput = input;
			return;
		}

		this.state.set(NodeState.Running, undefined);
		this.logger.debug(`Running node ${this.node.id} with input ${JSON.stringify(input)}`);
		await instantiationService.invokeFunction(accessor => runGraphNode(this.node.node, {
			accessor,
			store,
			input,
			token,
			flowGraph: this.graph,
			onOutput: (...output) => {
				this.logger.debug(`Node ${this.node.id} produced output ${JSON.stringify(output)}`);
				transaction(tx => {
					for (let i = 0; i < output.length; i++) {
						this.outgoing[i]?.forEach(cnx => cnx.data.set(output[i], tx));
					}
				});
			}
		}));

		this.state.set(NodeState.Waiting, undefined);

		if (this.runWhenDoneWithInput) {
			const input = this.runWhenDoneWithInput;
			this.runWhenDoneWithInput = undefined;
			this.doRun(store, instantiationService, token, input);
		}
	}
}
