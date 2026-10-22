/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class BuildLifecycle {
	private _activeBuilds = 0;
	private _failed = false;
	private readonly _onStart: (() => void) | undefined;
	private readonly _onEnd: (() => void) | undefined;

	constructor(onStart?: () => void, onEnd?: () => void) {
		this._onStart = onStart;
		this._onEnd = onEnd;
	}

	start(): (failed?: boolean) => void {
		if (this._activeBuilds++ === 0) {
			this._failed = false;
			try {
				this._onStart?.();
				this._emit('START');
			} catch (error) {
				this._activeBuilds--;
				throw error;
			}
		}
		let completed = false;
		return (failed = false) => {
			if (completed) {
				return;
			}
			completed = true;
			this._failed ||= failed;
			if (--this._activeBuilds === 0) {
				this._onEnd?.();
				this._emit(this._failed ? 'FAILED' : 'DONE');
			}
		};
	}

	private _emit(event: 'START' | 'DONE' | 'FAILED'): void {
		if (process.env.VSCODE_BUILD_EVENTS === '1') {
			console.log(`VSCODE_BUILD_${event}`);
		}
	}
}
