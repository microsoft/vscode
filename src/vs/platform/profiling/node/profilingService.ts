/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProfilingSession } from 'v8-inspect-profiler';
import { generateUuid } from '../../../base/common/uuid.js';
import { IV8InspectProfilingService, IV8Profile } from '../common/profiling.js';
import { IProgress, IProgressStep } from '../../progress/common/progress.js';

export class InspectProfilingService implements IV8InspectProfilingService {

	_serviceBrand: undefined;

	private readonly _sessions = new Map<string, ProfilingSession>();

	async startProfiling(options: { host: string; port: number }): Promise<string> {
		const prof = await import('v8-inspect-profiler');
		const session = await prof.startProfiling({ host: options.host, port: options.port, checkForPaused: true });
		const id = generateUuid();
		this._sessions.set(id, session);
		return id;
	}

	async takeHeapSnapshot(options: { host: string; port: number }, onData: (data: string) => void, progress?: IProgress<IProgressStep>): Promise<void> {
		const prof = await import('v8-inspect-profiler');
		let lastDone = 0;
		await prof.takeHeapSnapshot({
			host: options.host,
			port: options.port,
			checkForPaused: true,
			onChunk: onData,
			onProgress: (done, total) => {
				if (progress) {
					progress.report({ increment: done - lastDone, total });
					lastDone = done;
				}
			}
		});
	}

	async stopProfiling(sessionId: string): Promise<IV8Profile> {
		const session = this._sessions.get(sessionId);
		if (!session) {
			throw new Error(`UNKNOWN session '${sessionId}'`);
		}
		const result = await session.stop();
		this._sessions.delete(sessionId);
		return result.profile;
	}
}
