const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(extensionRoot, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = { ...process.env, VSCODE_BUILD_PROFILE: 'minimal' };

const compile = spawnSync(npm, ['run', 'compile'], {
	cwd: extensionRoot,
	env,
	stdio: 'inherit',
	shell: process.platform === 'win32',
});
if (compile.status !== 0) {
	process.exit(compile.status ?? 1);
}

const testFiles = fs.readdirSync(path.join(extensionRoot, 'test'))
	.filter(file => file.endsWith('.test.cjs'))
	.map(file => path.join(extensionRoot, 'test', file));
const tests = spawnSync(process.execPath, ['--test', ...testFiles], {
	cwd: repositoryRoot,
	env,
	stdio: 'inherit',
});
process.exit(tests.status ?? 1);
