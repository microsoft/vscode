import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

const TIMEOUT_MS = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

export async function buildCpp(workspace: string, target: string = 'debug'): Promise<void> {
	console.log(`[Builder] Building C++ project: ${workspace}, target=${target}`);

	// Check if CMakeLists.txt exists
	const cmakeFile = path.join(workspace, 'CMakeLists.txt');
	const hasCMake = await fs.access(cmakeFile).then(() => true).catch(() => false);

	if (hasCMake) {
		// Use CMake
		const buildDir = path.join(workspace, 'build');

		// Configure
		const configCmd = `cmake -S ${workspace} -B ${buildDir} -DCMAKE_BUILD_TYPE=${target === 'release' ? 'Release' : 'Debug'}`;
		console.log(`[Builder] CMake configure: ${configCmd}`);
		const { stdout: configOut, stderr: configErr } = await execAsync(configCmd, {
			timeout: TIMEOUT_MS,
			maxBuffer: MAX_OUTPUT_SIZE
		});

		if (configErr) {
			console.error('[Builder] CMake configure errors:', configErr);
		}

		// Build
		const buildCmd = `cmake --build ${buildDir} -j`;
		console.log(`[Builder] CMake build: ${buildCmd}`);
		const { stdout: buildOut, stderr: buildErr } = await execAsync(buildCmd, {
			timeout: TIMEOUT_MS,
			maxBuffer: MAX_OUTPUT_SIZE
		});

		if (buildErr) {
			console.error('[Builder] CMake build errors:', buildErr);
		}

		console.log('[Builder] C++ build successful');
	} else {
		// Fallback: compile all .cpp files in src/
		const srcDir = path.join(workspace, 'src');
		const includeDir = path.join(workspace, 'include');
		const buildDir = path.join(workspace, 'build');

		await fs.mkdir(buildDir, { recursive: true });

		const compileCmd = `g++ -std=c++17 -I${includeDir} ${srcDir}/*.cpp -o ${buildDir}/main`;
		console.log(`[Builder] g++ compile: ${compileCmd}`);

		const { stdout, stderr } = await execAsync(compileCmd, {
			timeout: TIMEOUT_MS,
			maxBuffer: MAX_OUTPUT_SIZE
		});

		if (stderr) {
			console.error('[Builder] g++ errors:', stderr);
		}

		console.log('[Builder] C++ build successful (fallback mode)');
	}
}

export async function runCpp(workspace: string, binary?: string): Promise<{ logs: string; exitCode: number }> {
	const binaryPath = binary || path.join(workspace, 'build', 'main');

	console.log(`[Builder] Running C++ binary: ${binaryPath}`);

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
