/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, isAbsolute, join } from 'vs/base/common/path';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IV8Profile {
	nodes: IV8ProfileNode[];
	samples?: number[];
	timeDeltas?: number[];
	startTime: number;
	endTime: number;
}

export interface IV8ProfileNode {
	id: number;
	hitCount?: number;
	children?: number[];
	callFrame: IV8CallFrame;
	deoptReason?: string;
	positionTicks?: { line: number; ticks: number }[];
}

export interface IV8CallFrame {
	url: string;
	scriptId: string;
	functionName: string;
	lineNumber: number;
	columnNumber: number;
}

export const IV8InspectProfilingService = createDecorator<IV8InspectProfilingService>('IV8InspectProfilingService');

export interface IV8InspectProfilingService {

	_serviceBrand: undefined;

	startProfiling(options: { port: number }): Promise<string>;

	stopProfiling(sessionId: string): Promise<IV8Profile>;
}


export namespace Utils {

	export function isValidProfile(profile: IV8Profile): profile is Required<IV8Profile> {
		return Boolean(profile.samples && profile.timeDeltas);
	}

	export function rewriteAbsolutePaths(profile: IV8Profile, replace: string = 'noAbsolutePaths') {
		for (const node of profile.nodes) {
			if (node.callFrame && node.callFrame.url) {
				if (isAbsolute(node.callFrame.url) || /^\w[\w\d+.-]*:\/\/\/?/.test(node.callFrame.url)) {
					node.callFrame.url = join(replace, basename(node.callFrame.url));
				}
			}
		}
		return profile;
	}
}
