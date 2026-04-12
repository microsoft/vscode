/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../base/common/path.js';
import { TernarySearchTree } from '../../../base/common/ternarySearchTree.js';
import { URI } from '../../../base/common/uri.js';
import { IWebWorkerServerRequestHandler } from '../../../base/common/worker/webWorker.js';
import { IV8Profile, Utils } from '../common/profiling.js';
import { IProfileModel, BottomUpSample, buildModel, BottomUpNode, processNode, CdpCallFrame } from '../common/profilingModel.js';
import { BottomUpAnalysis, IProfileAnalysisWorker, ProfilingOutput } from './profileAnalysisWorkerService.js';

export function create(): IWebWorkerServerRequestHandler {
	return new ProfileAnalysisWorker();
}

class ProfileAnalysisWorker implements IWebWorkerServerRequestHandler, IProfileAnalysisWorker {

	_requestHandlerBrand: void = undefined;

	$analyseBottomUp(profile: IV8Profile): BottomUpAnalysis {
		if (!Utils.isValidProfile(profile)) {
			return { kind: ProfilingOutput.Irrelevant, samples: [] };
		}

		const model = buildModel(profile);
		const samples = bottomUp(model, 5)
			.filter(s => !s.isSpecial);

		if (samples.length === 0 || samples[0].percentage < 10) {
			// ignore this profile because 90% of the time is spent inside "special" frames
			// like idle, GC, or program
			return { kind: ProfilingOutput.Irrelevant, samples: [] };
		}

		return { kind: ProfilingOutput.Interesting, samples };
	}

	$analyseByUrlCategory(profile: IV8Profile, categories: [url: URI, category: string][]): [category: string, aggregated: number][] {

		// build search tree
		const searchTree = TernarySearchTree.forUris<string>();
		searchTree.fill(categories);

		// cost by categories
		const model = buildModel(profile);
		const aggegrateByCategory = new Map<string, number>();

		for (const node of model.nodes) {
			const loc = model.locations[node.locationId];
			let category: string | undefined;
			try {
				category = searchTree.findSubstr(URI.parse(loc.callFrame.url));
			} catch {
				// ignore
			}
			if (!category) {
				category = printCallFrameShort(loc.callFrame);
			}
			const value = aggegrateByCategory.get(category) ?? 0;
			const newValue = value + node.selfTime;
			aggegrateByCategory.set(category, newValue);
		}

		const result: [string, number][] = [];
		for (const [key, value] of aggegrateByCategory) {
			result.push([key, value]);
		}
		return result;
	}
}

function isSpecial(call: CdpCallFrame): boolean {
	return call.functionName.startsWith('(') && call.functionName.endsWith(')');
}

function printCallFrameShort(frame: CdpCallFrame): string {
	let result = frame.functionName || '(anonymous)';
	if (frame.url) {
		result += '#';
		result += basename(frame.url);
		if (frame.lineNumber >= 0) {
			result += ':';
			result += frame.lineNumber + 1;
		}
		if (frame.columnNumber >= 0) {
			result += ':';
			result += frame.columnNumber + 1;
		}
	}
	return result;
}

function printCallFrameStackLike(frame: CdpCallFrame): string {
	let result = frame.functionName || '(anonymous)';
	if (frame.url) {
		result += ' (';
		result += frame.url;
		if (frame.lineNumber >= 0) {
			result += ':';
			result += frame.lineNumber + 1;
		}
		if (frame.columnNumber >= 0) {
			result += ':';
			result += frame.columnNumber + 1;
		}
		result += ')';
	}
	return result;
}

function getHeaviestLocationIds(model: IProfileModel, topN: number) {
	const stackSelfTime: { [locationId: number]: number } = {};
	for (const node of model.nodes) {
		stackSelfTime[node.locationId] = (stackSelfTime[node.locationId] || 0) + node.selfTime;
	}

	const locationIds = Object.entries(stackSelfTime)
		.sort(([, a], [, b]) => b - a)
		.slice(0, topN)
		.map(([locationId]) => Number(locationId));

	return new Set(locationIds);
}

function bottomUp(model: IProfileModel, topN: number) {
	const root = BottomUpNode.root();
	const locationIds = getHeaviestLocationIds(model, topN);

	for (const node of model.nodes) {
		if (locationIds.has(node.locationId)) {
			processNode(root, node, model);
			root.addNode(node);
		}
	}

	const result = Object.values(root.children)
		.sort((a, b) => b.selfTime - a.selfTime)
		.slice(0, topN);

	const samples: BottomUpSample[] = [];

	for (const node of result) {

		const sample: BottomUpSample = {
			selfTime: Math.round(node.selfTime / 1000),
			totalTime: Math.round(node.aggregateTime / 1000),
			location: printCallFrameShort(node.callFrame),
			absLocation: printCallFrameStackLike(node.callFrame),
			url: node.callFrame.url,
			caller: [],
			percentage: Math.round(node.selfTime / (model.duration / 100)),
			isSpecial: isSpecial(node.callFrame)
		};

		// follow the heaviest caller paths
		const stack = [node];
		while (stack.length) {
			const node = stack.pop()!;
			let top: BottomUpNode | undefined;
			for (const candidate of Object.values(node.children)) {
				if (!top || top.selfTime < candidate.selfTime) {
					top = candidate;
				}
			}
			if (top) {
				const percentage = Math.round(top.selfTime / (node.selfTime / 100));
				sample.caller.push({
					percentage,
					location: printCallFrameShort(top.callFrame),
					absLocation: printCallFrameStackLike(top.callFrame),
				});
				stack.push(top);
			}
		}

		samples.push(sample);
	}

	return samples;
}
