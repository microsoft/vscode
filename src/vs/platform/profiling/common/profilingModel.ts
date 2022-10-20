/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'vs/base/common/path';
import type { IV8Profile, IV8ProfileNode } from 'vs/platform/profiling/common/profiling';

// #region
// https://github.com/microsoft/vscode-js-profile-visualizer/blob/6e7401128ee860be113a916f80fcfe20ac99418e/packages/vscode-js-profile-core/src/cpu/model.ts#L4

interface IProfileModel {
	nodes: ReadonlyArray<IComputedNode>;
	locations: ReadonlyArray<ILocation>;
	samples: ReadonlyArray<number>;
	timeDeltas: ReadonlyArray<number>;
	rootPath?: string;
	duration: number;
}

interface IComputedNode {
	id: number;
	selfTime: number;
	aggregateTime: number;
	children: number[];
	parent?: number;
	locationId: number;
}

interface ISourceLocation {
	lineNumber: number;
	columnNumber: number;
	//   source: Dap.Source;
	relativePath?: string;
}

interface CdpCallFrame {
	functionName: string;
	scriptId: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
}

interface CdpPositionTickInfo {
	line: number;
	ticks: number;
}

interface INode {
	id: number;
	//   category: Category;
	callFrame: CdpCallFrame;
	src?: ISourceLocation;
}

interface ILocation extends INode {
	selfTime: number;
	aggregateTime: number;
	ticks: number;
}

interface IAnnotationLocation {
	callFrame: CdpCallFrame;
	locations: ISourceLocation[];
}

interface IProfileNode extends IV8ProfileNode {
	locationId?: number;
	positionTicks?: (CdpPositionTickInfo & {
		startLocationId?: number;
		endLocationId?: number;
	})[];
}

interface ICpuProfileRaw extends IV8Profile {
	//   $vscode?: IJsDebugAnnotations;
	nodes: IProfileNode[];
}


/**
 * Recursive function that computes and caches the aggregate time for the
 * children of the computed now.
 */
const computeAggregateTime = (index: number, nodes: IComputedNode[]): number => {
	const row = nodes[index];
	if (row.aggregateTime) {
		return row.aggregateTime;
	}

	let total = row.selfTime;
	for (const child of row.children) {
		total += computeAggregateTime(child, nodes);
	}

	return (row.aggregateTime = total);
};

const ensureSourceLocations = (profile: ICpuProfileRaw): ReadonlyArray<IAnnotationLocation> => {

	let locationIdCounter = 0;
	const locationsByRef = new Map<string, { id: number; callFrame: CdpCallFrame; location: ISourceLocation }>();

	const getLocationIdFor = (callFrame: CdpCallFrame) => {
		const ref = [
			callFrame.functionName,
			callFrame.url,
			callFrame.scriptId,
			callFrame.lineNumber,
			callFrame.columnNumber,
		].join(':');

		const existing = locationsByRef.get(ref);
		if (existing) {
			return existing.id;
		}
		const id = locationIdCounter++;
		locationsByRef.set(ref, {
			id,
			callFrame,
			location: {
				lineNumber: callFrame.lineNumber + 1,
				columnNumber: callFrame.columnNumber + 1,
				// source: {
				// 	name: maybeFileUrlToPath(callFrame.url),
				// 	path: maybeFileUrlToPath(callFrame.url),
				// 	sourceReference: 0,
				// },
			},
		});

		return id;
	};

	for (const node of profile.nodes) {
		node.locationId = getLocationIdFor(node.callFrame);
		node.positionTicks = node.positionTicks?.map(tick => ({
			...tick,
			// weirdly, line numbers here are 1-based, not 0-based. The position tick
			// only gives line-level granularity, so 'mark' the entire range of source
			// code the tick refers to
			startLocationId: getLocationIdFor({
				...node.callFrame,
				lineNumber: tick.line - 1,
				columnNumber: 0,
			}),
			endLocationId: getLocationIdFor({
				...node.callFrame,
				lineNumber: tick.line,
				columnNumber: 0,
			}),
		}));
	}

	return [...locationsByRef.values()]
		.sort((a, b) => a.id - b.id)
		.map(l => ({ locations: [l.location], callFrame: l.callFrame }));
};

/**
 * Computes the model for the given profile.
 */
export const buildModel = (profile: ICpuProfileRaw): IProfileModel => {
	if (!profile.timeDeltas || !profile.samples) {
		return {
			nodes: [],
			locations: [],
			samples: profile.samples || [],
			timeDeltas: profile.timeDeltas || [],
			// rootPath: profile.$vscode?.rootPath,
			duration: profile.endTime - profile.startTime,
		};
	}

	const { samples, timeDeltas } = profile;
	const sourceLocations = ensureSourceLocations(profile);
	const locations: ILocation[] = sourceLocations.map((l, id) => {
		const src = l.locations[0]; //getBestLocation(profile, l.locations);

		return {
			id,
			selfTime: 0,
			aggregateTime: 0,
			ticks: 0,
			// category: categorize(l.callFrame, src),
			callFrame: l.callFrame,
			src,
		};
	});

	const idMap = new Map<number /* id in profile */, number /* incrementing ID */>();
	const mapId = (nodeId: number) => {
		let id = idMap.get(nodeId);
		if (id === undefined) {
			id = idMap.size;
			idMap.set(nodeId, id);
		}

		return id;
	};

	// 1. Created a sorted list of nodes. It seems that the profile always has
	// incrementing IDs, although they are just not initially sorted.
	const nodes = new Array<IComputedNode>(profile.nodes.length);
	for (let i = 0; i < profile.nodes.length; i++) {
		const node = profile.nodes[i];

		// make them 0-based:
		const id = mapId(node.id);
		nodes[id] = {
			id,
			selfTime: 0,
			aggregateTime: 0,
			locationId: node.locationId as number,
			children: node.children?.map(mapId) || [],
		};

		for (const child of node.positionTicks || []) {
			if (child.startLocationId) {
				locations[child.startLocationId].ticks += child.ticks;
			}
		}
	}

	for (const node of nodes) {
		for (const child of node.children) {
			nodes[child].parent = node.id;
		}
	}

	// 2. The profile samples are the 'bottom-most' node, the currently running
	// code. Sum of these in the self time.
	const duration = profile.endTime - profile.startTime;
	let lastNodeTime = duration - timeDeltas[0];
	for (let i = 0; i < timeDeltas.length - 1; i++) {
		const d = timeDeltas[i + 1];
		nodes[mapId(samples[i])].selfTime += d;
		lastNodeTime -= d;
	}

	// Add in an extra time delta for the last sample. `timeDeltas[0]` is the
	// time before the first sample, and the time of the last sample is only
	// derived (approximately) by the missing time in the sum of deltas. Save
	// some work by calculating it here.
	if (nodes.length) {
		nodes[mapId(samples[timeDeltas.length - 1])].selfTime += lastNodeTime;
		timeDeltas.push(lastNodeTime);
	}

	// 3. Add the aggregate times for all node children and locations
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const location = locations[node.locationId];
		location.aggregateTime += computeAggregateTime(i, nodes);
		location.selfTime += node.selfTime;
	}

	return {
		nodes,
		locations,
		samples: samples.map(mapId),
		timeDeltas,
		// rootPath: profile.$vscode?.rootPath,
		duration,
	};
};

class BottomUpNode {
	public static root() {
		return new BottomUpNode({
			id: -1,
			selfTime: 0,
			aggregateTime: 0,
			ticks: 0,
			callFrame: {
				functionName: '(root)',
				lineNumber: -1,
				columnNumber: -1,
				scriptId: '0',
				url: '',
			},
		});
	}

	public children: { [id: number]: BottomUpNode } = {};
	public aggregateTime = 0;
	public selfTime = 0;
	public ticks = 0;
	public childrenSize = 0;

	public get id() {
		return this.location.id;
	}

	public get callFrame() {
		return this.location.callFrame;
	}

	public get src() {
		return this.location.src;
	}

	constructor(public readonly location: ILocation, public readonly parent?: BottomUpNode) { }

	public addNode(node: IComputedNode) {
		this.selfTime += node.selfTime;
		this.aggregateTime += node.aggregateTime;
	}

}

const processNode = (aggregate: BottomUpNode, node: IComputedNode, model: IProfileModel, initialNode = node) => {
	let child = aggregate.children[node.locationId];
	if (!child) {
		child = new BottomUpNode(model.locations[node.locationId], aggregate);
		aggregate.childrenSize++;
		aggregate.children[node.locationId] = child;
	}

	child.addNode(initialNode);

	if (node.parent) {
		processNode(child, model.nodes[node.parent], model, initialNode);
	}
};

//#endregion

function isSpecial(call: CdpCallFrame): boolean {
	return call.functionName.startsWith('(') && call.functionName.endsWith(')');
}

function isModel(arg: IV8Profile | IProfileModel): arg is IProfileModel {
	return Array.isArray((<IProfileModel>arg).locations)
		&& Array.isArray((<IProfileModel>arg).samples)
		&& Array.isArray((<IProfileModel>arg).timeDeltas);
}

export interface BottomUpSample {
	selfTime: number;
	totalTime: number;
	location: string;
	url: string;
	caller: { percentage: number; location: string }[];
	percentage: number;
	isSpecial: boolean;
}

export function bottomUp(profileOrModel: IV8Profile | IProfileModel, topN: number, fullPaths: boolean = false) {

	const model = isModel(profileOrModel)
		? profileOrModel
		: buildModel(profileOrModel);

	const root = BottomUpNode.root();
	for (const node of model.nodes) {
		processNode(root, node, model);
		root.addNode(node);
	}

	const result = Object.values(root.children)
		.sort((a, b) => b.selfTime - a.selfTime)
		.slice(0, topN);


	const samples: BottomUpSample[] = [];

	function printCallFrame(frame: CdpCallFrame): string {
		let result = frame.functionName || '(anonymous)';
		if (frame.url) {
			result += '#';
			result += fullPaths ? frame.url : basename(frame.url);
			if (frame.lineNumber >= 0) {
				result += ':';
				result += frame.lineNumber + 1;
			}
		}
		return result;
	}

	for (const node of result) {

		const sample: BottomUpSample = {
			selfTime: Math.round(node.selfTime / 1000),
			totalTime: Math.round(node.aggregateTime / 1000),
			location: printCallFrame(node.callFrame),
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
				sample.caller.push({ percentage, location: printCallFrame(top.callFrame) });
				stack.push(top);
			}
		}

		samples.push(sample);
	}

	return samples;
}
