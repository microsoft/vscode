/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BridgePty } from '../../src/bridge';

export class FakePty implements BridgePty {
	private readonly dataListeners = new Set<(data: string) => void>();
	private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
	readonly writes: string[] = [];
	readonly sizes: number[][] = [];
	pauses = 0;
	resumes = 0;
	kills = 0;

	onData(listener: (data: string) => void): { dispose(): void } {
		this.dataListeners.add(listener);
		return { dispose: () => { this.dataListeners.delete(listener); } };
	}
	onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void } {
		this.exitListeners.add(listener);
		return { dispose: () => { this.exitListeners.delete(listener); } };
	}
	write(data: string | Buffer): void { this.writes.push(data.toString()); }
	resize(cols: number, rows: number): void { this.sizes.push([cols, rows]); }
	pause(): void { this.pauses++; }
	resume(): void { this.resumes++; }
	kill(): void { this.kills++; }
	data(data: string): void { for (const listener of this.dataListeners) { listener(data); } }
	exit(exitCode: number, signal?: number): void { for (const listener of this.exitListeners) { listener({ exitCode, signal }); } }
	get listenerCount(): number { return this.dataListeners.size + this.exitListeners.size; }
}
