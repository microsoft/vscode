import { Process } from "@aws/amazon-q-developer-cli-api-bindings";
import { withTimeout } from "@aws/amazon-q-developer-cli-shared/utils";
import { createErrorInstance } from "@aws/amazon-q-developer-cli-shared/errors";
import logger from "loglevel";
import { cleanOutput, executeCommandTimeout } from "./executeCommand.js";
import { fread } from "./fs.js";
import { osIsWindows } from '../../../helpers/os.js';

export const LoginShellError = createErrorInstance("LoginShellError");

const DONE_SOURCING_OSC = "\u001b]697;DoneSourcing\u0007";

let etcShells: Promise<string[]> | undefined;

const getShellExecutable = async (shellName: string) => {
	if (!etcShells) {
		etcShells = fread("/etc/shells").then((shells) =>
			shells
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith("#")),
		);
	}

	try {
		return (
			(await etcShells).find((shell) => shell.includes(shellName)) ??
			(
				await executeCommandTimeout({
					command: "/usr/bin/which",
					args: [shellName],
				})
			).stdout
		);
	} catch (_) {
		return undefined;
	}
};

export const executeLoginShell = async ({
	command,
	executable,
	shell,
	timeout,
}: {
	command: string;
	executable?: string;
	shell?: string;
	timeout?: number;
}): Promise<string> => {
	let exe = executable;
	if (!exe) {
		if (!shell) {
			throw new LoginShellError("Must pass shell or executable");
		}
		exe = await getShellExecutable(shell);
		if (!exe) {
			throw new LoginShellError(`Could not find executable for ${shell}`);
		}
	}
	// const flags = window.fig.constants?.os === "linux" ? "-lc" : "-lic";
	//TODO@meganrogge
	const flags = !osIsWindows() ? "-lc" : "-lic";

	const process = Process.run({
		executable: exe,
		args: [flags, command],
		// terminalSessionId: window.globalTerminalSessionId,
		//TODO@meganrogge
		terminalSessionId: 'test',
		timeout,
	});

	try {
		// logger.info(`About to run login shell command '${command}'`, {
		//   separateProcess: Boolean(window.f.Process),
		//   shell: exe,
		// });
		const start = performance.now();
		const result = await withTimeout(
			timeout ?? 5000,
			process.then((output: any) => {
				if (output.exitCode !== 0) {
					logger.warn(
						`Command ${command} exited with exit code ${output.exitCode}: ${output.stderr}`,
					);
				}
				return cleanOutput(output.stdout);
			}),
		);
		const idx =
			result.lastIndexOf(DONE_SOURCING_OSC) + DONE_SOURCING_OSC.length;
		const trimmed = result.slice(idx);
		const end = performance.now();
		logger.info(`Result of login shell command '${command}'`, {
			result: trimmed,
			time: end - start,
		});
		return trimmed;
	} catch (err) {
		logger.error(`Error running login shell command '${command}'`, { err });
		throw err;
	}
};

export const executeCommand: Fig.ExecuteCommandFunction = (args) =>
	executeCommandTimeout(args);
