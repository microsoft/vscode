/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageModelToolInformation } from 'vscode';
import { ConfigKey, HARD_TOOL_LIMIT, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { equals as arraysEqual, uniqueFilter } from '../../../../util/vs/base/common/arrays';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Iterable } from '../../../../util/vs/base/common/iterator';
import { IObservable } from '../../../../util/vs/base/common/observableInternal';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { EMBEDDINGS_GROUP_NAME, VIRTUAL_TOOL_NAME_PREFIX, VirtualTool } from './virtualTool';
import { VirtualToolGrouper } from './virtualToolGrouper';
import * as Constant from './virtualToolsConstants';
import { IToolCategorization, IToolGrouping } from './virtualToolTypes';

export function computeToolGroupingMinThreshold(experimentationService: IExperimentationService, configurationService: IConfigurationService): IObservable<number> {
	return configurationService.getExperimentBasedConfigObservable(ConfigKey.VirtualToolThreshold, experimentationService).map(configured => {
		const value = configured ?? HARD_TOOL_LIMIT;
		return value <= 0 ? Infinity : value;
	});
}

export class ToolGrouping implements IToolGrouping {
	private readonly _root = new VirtualTool(VIRTUAL_TOOL_NAME_PREFIX, '', Infinity, { wasExpandedByDefault: true });
	protected _grouper: IToolCategorization = this._instantiationService.createInstance(VirtualToolGrouper);
	private _didToolsChange = true;
	private _turnNo = 0;
	private _trimOnNextCompute = false;
	private _expandOnNext?: Set<string>;

	public get tools(): readonly LanguageModelToolInformation[] {
		return this._tools;
	}

	public set tools(tools: readonly LanguageModelToolInformation[]) {
		if (!arraysEqual(this._tools, tools, (a, b) => a.name === b.name)) {
			this._tools = tools;
			// Keep the root so that we can still expand any in-flight requests.
			this._didToolsChange = true;
		}
	}

	constructor(
		private _tools: readonly LanguageModelToolInformation[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._root.isExpanded = true;
	}

	didCall(localTurnNumber: number, toolCallName: string): LanguageModelToolResult | undefined {
		const result = this._root.find(toolCallName);
		if (!result) {
			return;
		}

		const { path, tool } = result;
		for (const part of path) {
			part.lastUsedOnTurn = this._turnNo;
		}

		if (path.length > 1) { // only for tools in groups under the root
			/* __GDPR__
				"virtualTools.called" : {
					"owner": "connor4312",
					"comment": "Reports information about the usage of virtual tools.",
					"callName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Name of the categorized group (MCP or extension)" },
					"isVirtual": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether this called a virtual tool", "isMeasurement": true },
					"turnNo": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of turns into the loop when this expansion was made", "isMeasurement": true },
					"depth": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Nesting depth of the tool", "isMeasurement": true },
					"preExpanded": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool was pre-expanded or expanded on demand", "isMeasurement": true },
					"wasEmbedding": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool was pre-expanded due to an embedding", "isMeasurement": true },
					"totalTools": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of tools available when this tool was called", "isMeasurement": true }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('virtualTools.called', {
				callName: tool.name,
			}, {
				turnNo: localTurnNumber,
				isVirtual: tool instanceof VirtualTool ? 1 : 0,
				depth: path.length - 1,
				preExpanded: path.every(p => p.metadata.wasExpandedByDefault) ? 1 : 0,
				wasEmbedding: path.some(p => p.name === EMBEDDINGS_GROUP_NAME) ? 1 : 0,
				totalTools: this._tools.length,
			});
		}

		if (!(tool instanceof VirtualTool)) {
			return;
		}

		tool.isExpanded = true;
		return new LanguageModelToolResult([
			new LanguageModelTextPart(`Tools activated: ${[...tool.tools()].map(t => t.name).join(', ')}`),
		]);
	}

	getContainerFor(tool: string): VirtualTool | undefined {
		const result = this._root.find(tool);
		const last = result?.path.at(-1);
		return last === this._root ? undefined : last;
	}

	didTakeTurn(): void {
		this._turnNo++;
	}

	didInvalidateCache(): void {
		this._trimOnNextCompute = true;
	}

	ensureExpanded(toolName: string): void {
		this._expandOnNext ??= new Set();
		this._expandOnNext.add(toolName);
	}

	async compute(query: string, token: CancellationToken): Promise<LanguageModelToolInformation[]> {
		await this._doCompute(query, token);
		return [...this._root.tools()].filter(uniqueFilter(t => t.name));
	}

	async computeAll(query: string, token: CancellationToken): Promise<(LanguageModelToolInformation | VirtualTool)[]> {
		await this._doCompute(query, token);
		return this._root.contents;
	}

	private async _doCompute(query: string, token: CancellationToken) {
		if (this._didToolsChange) {
			await this._grouper.addGroups(query, this._root, this._tools.slice(), token);
			this._didToolsChange = false;
		}

		if (this._expandOnNext) {
			for (const toolName of this._expandOnNext) {
				this._root.find(toolName)?.path.forEach(p => {
					p.isExpanded = true;
					p.lastUsedOnTurn = this._turnNo;
				});
			}
			this._expandOnNext = undefined;
		}

		let trimDownTo = HARD_TOOL_LIMIT;

		if (this._trimOnNextCompute) {
			await this._grouper.recomputeEmbeddingRankings(query, this._root, token);
			trimDownTo = Constant.TRIM_THRESHOLD;
			this._trimOnNextCompute = false;
		}

		this._root.lastUsedOnTurn = Infinity; // ensure the root doesn't get trimmed out

		while (Iterable.length(this._root.tools()) > trimDownTo) {
			const lowest = this._root.getLowestExpandedTool();
			if (!lowest || !isFinite(lowest.lastUsedOnTurn)) {
				break; // No more tools to trim.
			}
			if (lowest.metadata.canBeCollapsed === false) {
				lowest.lastUsedOnTurn = Infinity;
				continue;
			}

			lowest.isExpanded = false;
			lowest.metadata.wasExpandedByDefault = false;
		}
		this._trimOnNextCompute = false;
	}
}
