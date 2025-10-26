import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

const TIMEOUT_MS = 30000;
const MAX_OUTPUT_SIZE = 1024 * 1024;

export async function buildC(workspace: string, target: string = 'debug'): Promise<void> {
	console.log(`[Builder] Building C project: ${workspace}, target=${target}`);

	const srcDir = path.join(workspace, 'src');
	const includeDir = path.join(workspace, 'include');
	const buildDir = path.join(workspace, 'build');

	await fs.mkdir(buildDir, { recursive: true });

	const flags = target === 'release' ? '-O2' : '-g';
	const compileCmd = `gcc -std=c11 ${flags} -I${includeDir} ${srcDir}/*.c -o ${buildDir}/main`;

	console.log(`[Builder] gcc compile: ${compileCmd}`);

	const { stdout, stderr } = await execAsync(compileCmd, {
		timeout: TIMEOUT_MS,
		maxBuffer: MAX_OUTPUT_SIZE
	});

	if (stderr) {
		console.error('[Builder] gcc errors:', stderr);
	}

	console.log('[Builder] C build successful');
}

export async function runC(workspace: string, binary?: string): Promise<{ logs: string; exitCode: number }> {
	const binaryPath = binary || path.join(workspace, 'build', 'main');

	console.log(`[Builder] Running C binary: ${binaryPath}`);

	try {
		const { stdout, stderr } = await execAsync(binaryPath, {
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
