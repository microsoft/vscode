/**
 * NOTE: this is intended to be separate because executeCommand
 * will often be mocked during testing of functions that call it.
 * If it gets bundled in the same file as the functions that call it
 * vitest is not able to mock it (because of esm restrictions).
 */
import { withTimeout } from "../../shared/src/utils";
import { Process } from "@aws/amazon-q-developer-cli-api-bindings";
import logger from "loglevel";
import { osIsWindows } from '../../../helpers/os';

export const cleanOutput = (output: string) =>
	output
		.replace(/\r\n/g, "\n") // Replace carriage returns with just a normal return
		// eslint-disable-next-line no-control-regex
		.replace(/\x1b\[\?25h/g, "") // removes cursor character if present
		.replace(/^\n+/, "") // strips new lines from start of output
		.replace(/\n+$/, ""); // strips new lines from end of output

export const executeCommandTimeout = async (
	input: Fig.ExecuteCommandInput,
	timeout = osIsWindows() ? 20000 : 5000,
): Promise<Fig.ExecuteCommandOutput> => {
	const command = [input.command, ...input.args].join(" ");
	try {
		logger.info(`About to run shell command '${command}'`);
		const start = performance.now();
		const result: any = await withTimeout(
			Math.max(timeout, input.timeout ?? 0),
			Process.run({
				executable: input.command,
				args: input.args,
				environment: input.env,
				workingDirectory: input.cwd,
				// terminalSessionId: window.globalTerminalSessionId,
				//TODO@meganrogge
				terminalSessionId: "test",
				timeout: input.timeout,
			}),
		);
		const end = performance.now();
		logger.info(`Result of shell command '${command}'`, {
			result,
			time: end - start,
		});

		const cleanStdout = cleanOutput(result.stdout);
		const cleanStderr = cleanOutput(result.stderr);

		if (result.exitCode !== 0) {
			logger.warn(
				`Command ${command} exited with exit code ${result.exitCode}: ${cleanStderr}`,
			);
		}
		return {
			status: result.exitCode,
			stdout: cleanStdout,
			stderr: cleanStderr,
		};
	} catch (err) {
		logger.error(`Error running shell command '${command}'`, { err });
		throw err;
	}
};
