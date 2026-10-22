/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Output of the launch skill scripts. The PowerShell wrappers start Node without handle
// inheritance, so that Code does not inherit a pipe a caller reads to the end and keep that
// caller waiting. Output then goes to the files those wrappers name instead of stdout and stderr.

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
