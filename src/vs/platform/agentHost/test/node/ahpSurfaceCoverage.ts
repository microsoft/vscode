/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from '../../../../base/common/path.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Records which Agent Host Protocol symbols the E2E suites actually exercise.
 *
 * Line coverage tells us which *host code* runs; it cannot tell us which parts
 * of the *contract* are pinned by a test. A replacement AHP implementation
 * shares none of our lines but must honor every symbol, so protocol-surface
 * coverage is the metric that survives the implementation being swapped out.
 *
 * This is a steering signal, not a gate: a symbol counts as covered the moment
 * it crosses the wire in either direction, which says nothing about how deeply
 * its semantics are asserted. Use it to find contract areas with *no* test at
 * all, then read the tests to judge the ones that are nominally covered.
 */

/** Which direction of the protocol a symbol was observed on. */
export type AhpSurfaceKind = 'command' | 'notification' | 'action';

interface IObservedSurface {
	readonly commands: string[];
	readonly notifications: string[];
	readonly actions: string[];
}

const observed: Record<AhpSurfaceKind, Set<string>> = {
	command: new Set<string>(),
	notification: new Set<string>(),
	action: new Set<string>(),
};

let outputPath: string | undefined;
let enabled: boolean | undefined;
let warned = false;

function isEnabled(): boolean {
	if (enabled === undefined) {
		enabled = process.env['AGENT_HOST_RECORD_PROTOCOL_SURFACE'] === '1';
	}
	return enabled;
}

function resolveOutputPath(): string {
	if (!outputPath) {
		const configured = process.env['AGENT_HOST_PROTOCOL_SURFACE_OUT'];
		outputPath = configured
			? configured
			: URI.joinPath(FileAccess.asFileUri(''), '../.build/agent-host-e2e-coverage/protocol-surface/observed.json').fsPath;
	}
	return outputPath;
}

/**
 * Records a protocol symbol as exercised.
 *
 * Called from the wire layer of the test client so that every test contributes
 * without opting in. Cheap on the hot path: a `Set` membership check, with a
 * file write only on the first sighting of each symbol (bounded by the size of
 * the protocol, so a few dozen tiny writes per run). Writing eagerly rather
 * than on process exit keeps the data intact when a run is killed by a timeout.
 */
export function recordAhpSurface(kind: AhpSurfaceKind, symbol: string): void {
	if (!isEnabled() || !symbol) {
		return;
	}
	const seen = observed[kind];
	if (seen.has(symbol)) {
		return;
	}
	seen.add(symbol);
	flush();
}

function flush(): void {
	const payload: IObservedSurface = {
		commands: [...observed.command].sort(),
		notifications: [...observed.notification].sort(),
		actions: [...observed.action].sort(),
	};
	try {
		const path = resolveOutputPath();
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(payload, undefined, '\t')}\n`);
	} catch (error) {
		// Coverage recording must never fail a test run, but a silent failure
		// here surfaces much later as the coverage script reporting a missing
		// observation file. Warn once so the real cause is in the same log.
		if (!warned) {
			warned = true;
			console.warn(`[ahp-surface-coverage] failed to write protocol surface observations to ${resolveOutputPath()}: ${error}`);
		}
	}
}
