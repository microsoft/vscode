/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IPendingSave {
	versionId: number;
	promise: Promise<void>;
}

interface ISaveOperation {
	promise: Promise<void>;
	promiseResolve: () => void;
	promiseReject: (error: Error) => void;
	run: () => Promise<void>;
}

export class SaveSequentializer {
	private _pendingSave?: IPendingSave;
	private _nextSave?: ISaveOperation;

	hasPendingSave(versionId?: number): boolean {
		if (!this._pendingSave) {
			return false;
		}

		if (typeof versionId === 'number') {
			return this._pendingSave.versionId === versionId;
		}

		return !!this._pendingSave;
	}

	get pendingSave(): Promise<void> | undefined {
		return this._pendingSave ? this._pendingSave.promise : undefined;
	}

	setPending(versionId: number, promise: Promise<void>): Promise<void> {
		this._pendingSave = { versionId, promise };

		promise.then(() => this.donePending(versionId), () => this.donePending(versionId));

		return promise;
	}

	private donePending(versionId: number): void {
		if (this._pendingSave && versionId === this._pendingSave.versionId) {

			// only set pending to done if the promise finished that is associated with that versionId
			this._pendingSave = undefined;

			// schedule the next save now that we are free if we have any
			this.triggerNextSave();
		}
	}

	private triggerNextSave(): void {
		if (this._nextSave) {
			const saveOperation = this._nextSave;
			this._nextSave = undefined;

			// Run next save and complete on the associated promise
			saveOperation.run().then(saveOperation.promiseResolve, saveOperation.promiseReject);
		}
	}

	setNext(run: () => Promise<void>): Promise<void> {

		// this is our first next save, so we create associated promise with it
		// so that we can return a promise that completes when the save operation
		// has completed.
		if (!this._nextSave) {
			let promiseResolve: () => void;
			let promiseReject: (error: Error) => void;
			const promise = new Promise<void>((resolve, reject) => {
				promiseResolve = resolve;
				promiseReject = reject;
			});

			this._nextSave = {
				run,
				promise,
				promiseResolve: promiseResolve!,
				promiseReject: promiseReject!
			};
		}

		// we have a previous next save, just overwrite it
		else {
			this._nextSave.run = run;
		}

		return this._nextSave.promise;
	}
}
