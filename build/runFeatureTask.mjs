import { spawn } from 'node:child_process';

const [feature, task] = process.argv.slice(2);
if (feature !== 'copilot' || !['compile', 'watch'].includes(task)) {
	throw new Error(`Unsupported optional feature task: ${feature} ${task}`);
}

// The TypeScript watch pipeline defaults to the minimal development profile.
// Packaged/compile tasks preserve the full default profile unless selected otherwise.
const profile = process.env.VSCODE_BUILD_PROFILE ?? (task === 'watch' ? 'minimal' : 'default');
if (profile !== 'default' && profile !== 'minimal') {
	throw new Error(`Unknown VSCODE_BUILD_PROFILE '${profile}'. Expected 'default' or 'minimal'.`);
}

if (profile === 'minimal') {
	console.log(`[build] skipping ${feature} ${task} for the minimal profile`);
	process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['--prefix', 'extensions/copilot', 'run', task], { stdio: 'inherit' });
child.on('error', error => {
	console.error(error);
	process.exitCode = 1;
});
child.on('exit', (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
