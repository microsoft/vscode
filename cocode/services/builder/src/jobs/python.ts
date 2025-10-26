import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TIMEOUT_MS = 30000;
const MAX_OUTPUT_SIZE = 1024 * 1024;

export async function runPython(workspace: string, script?: string): Promise<{ logs: string; exitCode: number }> {
	const pythonScript = script || 'main.py';

	console.log(`[Builder] Running Python script: ${pythonScript}`);

	try {
		const { stdout, stderr } = await execAsync(`python3 ${pythonScript}`, {
			timeout: TIMEOUT_MS,
			maxBuffer: MAX_OUTPUT_SIZE,
			cwd: workspace
		});

		return {
			logs: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ''),
			exitCode: 0
		};
	} catch (error: any) {
		return {
			logs: (error.stdout || '') + (error.stderr ? `\nSTDERR:\n${error.stderr}` : ''),
			exitCode: error.code || 1
		};
	}
}
