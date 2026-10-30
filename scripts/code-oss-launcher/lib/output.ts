/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Preserve optional file-based output for callers that cannot inherit stdio handles.
// The managed adapter uses ordinary stdout/stderr pipes.

import { appendFileSync } from 'node:fs';

const stdoutFile = process.env.CODE_OSS_DEV_STDOUT_FILE;
const stderrFile = process.env.CODE_OSS_DEV_STDERR_FILE;
delete process.env.CODE_OSS_DEV_STDOUT_FILE;
delete process.env.CODE_OSS_DEV_STDERR_FILE;

export function writeStdout(text: string): void {
	if (stdoutFile) {
		appendFileSync(stdoutFile, text);
	} else {
		process.stdout.write(text);
	}
}

export function writeStderr(text: string): void {
	if (stderrFile) {
		appendFileSync(stderrFile, text);
	} else {
		process.stderr.write(text);
	}
}
