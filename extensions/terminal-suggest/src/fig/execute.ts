/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { osIsWindows } from '../helpers/os';
import { spawnHelper2 } from '../shell/common';
import { withTimeout } from './shared/utils';

export const cleanOutput = (output: string) =>
	output
		.replace(/\r\n/g, '\n') // Replace carriage returns with just a normal return
		.replace(/\x1b\[\?25h/g, '') // removes cursor character if present
		.replace(/^\n+/, '') // strips new lines from start of output
		.replace(/\n+$/, ''); // strips new lines from end of output

export const executeCommandTimeout = async (
	input: Fig.ExecuteCommandInput,
	timeout = osIsWindows() ? 20000 : 5000,
): Promise<Fig.ExecuteCommandOutput> => {
	const command = [input.command, ...input.args].join(' ');
	try {
		console.debug(`About to run shell command '${command}'`);
		const result = await withTimeout(
			Math.max(timeout, input.timeout ?? 0),
			spawnHelper2(input.command, input.args, {
				env: input.env,
				cwd: input.cwd,
				timeout: input.timeout,
			})
		);

		const cleanStdout = cleanOutput(result.stdout);
		const cleanStderr = cleanOutput(result.stderr);

		if (result.exitCode !== 0) {
			console.warn(
				`Command ${command} exited with exit code ${result.exitCode}: ${cleanStderr}`,
			);
		}
		return {
			status: result.exitCode,
			stdout: cleanStdout,
			stderr: cleanStderr,
		};
	} catch (err) {
		console.error(`Error running shell command '${command}'`, { err });
		throw err;
	}
};


export const executeCommand: Fig.ExecuteCommandFunction = (args) =>
	executeCommandTimeout(args);

export interface IFigExecuteExternals {
	executeCommand: Fig.ExecuteCommandFunction;
	executeCommandTimeout: (
		input: Fig.ExecuteCommandInput,
		timeout: number,
	) => Promise<Fig.ExecuteCommandOutput>;
}
