/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { ILogService } from '../../log/common/logService';

/**
 * Set to `true` to dump every SSE event from the Responses API to a
 * timestamped log file under `<repo-root>/.responses-stream-dumps/`.
 * Useful for debugging phased output, commentary/final_answer
 * concatenation, and stream ordering.
 *
 * **Do not commit with this set to `true`.**
 */
const ENABLE_RESPONSES_STREAM_DUMP = false
	// || Boolean("true") // this's done this way to easily uncomment but also to not let you commit it due to internationalized string doublequote use
	;

export interface IResponsesStreamDumper {
	/** Append a single SSE event to the dump file. */
	logEvent(responseStreamEvent: OpenAI.Responses.ResponseStreamEvent): void;
}

const noopDumper: IResponsesStreamDumper = {
	logEvent() { /* noop */ }
};

class ResponsesStreamDumper implements IResponsesStreamDumper {
	constructor(private readonly filePath: string) { }

	logEvent(responseStreamEvent: OpenAI.Responses.ResponseStreamEvent): void {
		const timestamp = new Date();
		try {
			const prettyData = JSON.stringify({ ...responseStreamEvent, type: undefined }, null, 2);
			fs.appendFileSync(this.filePath, `${timestamp.toISOString()} ${responseStreamEvent.type}\n${prettyData}\n\n`);
		} catch {
			// Swallow write errors so debugging never breaks real functionality.
		}
	}
}

/**
 * Creates a dumper for the given request. When {@link ENABLE_RESPONSES_STREAM_DUMP}
 * is `false` this returns a no-op implementation with zero overhead.
 */
export function createResponsesStreamDumper(requestId: string, logService: ILogService): IResponsesStreamDumper {
	if (!ENABLE_RESPONSES_STREAM_DUMP) {
		return noopDumper;
	}

	try {
		// At runtime this file lives in `extensions/copilot/dist/`; go up
		// three levels to land at the repo root, then write into a
		// dedicated (gitignored) subfolder so dumps don't pollute `dist/`.
		const repoRoot = path.resolve(__dirname, '..', '..', '..');
		const dumpDir = path.join(repoRoot, '.responses-stream-dumps');
		fs.mkdirSync(dumpDir, { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const filePath = path.join(dumpDir, `responses-stream-${ts}-${requestId.slice(0, 4)}.log`);
		fs.writeFileSync(filePath, `# Responses API SSE stream dump\n# requestId=${requestId}\n# started=${new Date().toISOString()}\n\n`);
		logService.info(`[responsesAPI] Dumping SSE stream to ${filePath}`);
		return new ResponsesStreamDumper(filePath);
	} catch {
		return noopDumper;
	}
}
