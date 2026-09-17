/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as os from 'os';
import * as path from 'path';
import { CancellationTokenSource } from '../../../../src/util/vs/base/common/cancellation';
import { AdhocResponseOutput, AdhocResponseType, IAdhocRequest } from '../../shared/sharedTypes';
import { spawnSimulationFromMainProcess } from '../utils/simulationExec';

export const enum AdhocRequestState {
	Idle,
	Running,
	Done,
	Error,
}

/**
 * Sends an adhoc chat request by spawning the simulation CLI and streaming the
 * response back. Used by the "Adhoc request sender" mode in the workbench.
 */
export class AdhocRequestSender {

	@mobx.observable
	public state: AdhocRequestState = AdhocRequestState.Idle;

	/** The accumulated response text streamed from the model. */
	@mobx.observable
	public response: string = '';

	/** The error message, set when {@link state} is {@link AdhocRequestState.Error}. */
	@mobx.observable
	public error: string | undefined = undefined;

	private cancellationTokenSource: CancellationTokenSource | undefined;

	constructor() {
		mobx.makeObservable(this);
	}

	public async send(request: IAdhocRequest): Promise<void> {
		if (this.state === AdhocRequestState.Running) {
			return;
		}

		const cancellationTokenSource = new CancellationTokenSource();
		this.cancellationTokenSource = cancellationTokenSource;

		mobx.runInAction(() => {
			this.state = AdhocRequestState.Running;
			this.response = '';
			this.error = undefined;
		});

		const requestFilePath = path.join(os.tmpdir(), `adhoc-request-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

		try {
			await fs.promises.writeFile(requestFilePath, JSON.stringify(request), { encoding: 'utf8', mode: 0o600 });

			const stream = spawnSimulationFromMainProcess<AdhocResponseOutput>(
				{ args: [`--adhoc-request-file=${requestFilePath}`], ignoreNonJSONLines: true },
				cancellationTokenSource.token
			);

			for await (const output of stream) {
				if (cancellationTokenSource.token.isCancellationRequested) {
					break;
				}
				this.interpretOutput(output);
			}
		} catch (err) {
			if (!cancellationTokenSource.token.isCancellationRequested) {
				mobx.runInAction(() => {
					this.state = AdhocRequestState.Error;
					this.error = err instanceof Error ? (err.stack ?? err.message) : String(err);
				});
			}
		} finally {
			fs.promises.unlink(requestFilePath).catch(() => { /* best effort cleanup */ });
			// Always dispose this send's token source to avoid leaking its
			// cancellation listeners across repeated Send/Stop cycles, regardless of
			// whether this send is still the current one.
			cancellationTokenSource.dispose();
			// Only finalize shared state if this send is still the current one. A
			// superseded send (the user hit Stop then Send again) must not clobber the
			// newer request's state or cancellation token source.
			if (this.cancellationTokenSource === cancellationTokenSource) {
				this.cancellationTokenSource = undefined;
				mobx.runInAction(() => {
					if (this.state === AdhocRequestState.Running) {
						// Stream ended without an explicit done/error message.
						this.state = this.error !== undefined ? AdhocRequestState.Error : AdhocRequestState.Done;
					}
				});
			}
		}
	}

	public cancel(): void {
		this.cancellationTokenSource?.cancel();
		this.cancellationTokenSource = undefined;
		mobx.runInAction(() => {
			if (this.state === AdhocRequestState.Running) {
				this.state = AdhocRequestState.Idle;
			}
		});
	}

	private interpretOutput(output: AdhocResponseOutput): void {
		mobx.runInAction(() => {
			switch (output.type) {
				case AdhocResponseType.delta:
					this.response += output.value;
					return;
				case AdhocResponseType.done:
					this.response = output.value;
					this.state = AdhocRequestState.Done;
					return;
				case AdhocResponseType.error:
					this.error = output.value;
					this.state = AdhocRequestState.Error;
					return;
			}
		});
	}
}
