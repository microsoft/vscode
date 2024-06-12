/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FlowGraph } from 'vs/workbench/contrib/flowEditor/browser/flowGraph';
import { FlowEditorInput } from 'vs/workbench/contrib/flowEditor/common/flowEditorInput';
import { IFlowGraphData } from 'vs/workbench/contrib/flowEditor/common/flowEditorTypes';
import { IFlowGraph, IFlowGraphService } from 'vs/workbench/contrib/flowEditor/common/flowGraphService';

export class FlowGraphService extends Disposable implements IFlowGraphService {
	declare readonly _serviceBrand: undefined;
	private readonly runningCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly workspaceGraphs = new ResourceMap<IFlowGraph>();
	private readonly logger: ILogger;
	private workspaceReady: Promise<void>;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();

		this.logger = this._register(loggerService.createLogger('flowgraphs', { name: localize('flowgraphs', "Flow graphs") }));
		this.workspaceReady = this.runAllGraphs();
		this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => {
			this.workspaceReady = this.runAllGraphs();
		}));
	}

	public async getGraphs(): Promise<IFlowGraph[]> {
		await this.workspaceReady;
		return [...this.workspaceGraphs.values()];
	}

	public async getGraph(uri: URI): Promise<IFlowGraph> {
		await this.workspaceReady;

		const fromWorkspace = this.workspaceGraphs.get(uri);
		if (fromWorkspace) {
			return fromWorkspace;
		}

		let contents: IFlowGraphData;
		try {
			const src = await this.fileService.readFile(uri);
			contents = JSON.parse(src.value.toString());
		} catch {
			contents = IFlowGraphData.empty();
		}

		return this.instaService.createInstance(FlowGraph, contents, uri, this.logger);
	}

	private getWorkspaceGraphs(): Promise<IFlowGraph[]> {
		return Promise.all(this.workspaceContextService.getWorkspace().folders.map(folder => {
			const uri = folder.uri.with({ path: folder.uri.path + `/.vscode/flows${FlowEditorInput.EXT}` });
			return this.getGraph(uri);
		}));
	}

	private async runAllGraphs() {
		this.runningCts.value?.dispose(true);
		const cts = new CancellationTokenSource();
		this.runningCts.value = cts;

		const graphs = await this.getWorkspaceGraphs();
		if (cts.token.isCancellationRequested) {
			return;
		}

		const toRemove = new Set([...this.workspaceGraphs.keys()].map(u => u.toString()));
		for (const graph of graphs) {
			this.workspaceGraphs.set(graph.fileUri, graph);
			toRemove.delete(graph.fileUri.toString());
			graph.run(cts.token);
		}

		for (const uri of toRemove) {
			this.workspaceGraphs.delete(URI.parse(uri));
		}
	}
}
