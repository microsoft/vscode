import { command, defineProject } from '@vscode/dev-workspace';

const runtimeInfo = command({
	executable: process.execPath,
	args: ['-e', 'console.log(JSON.stringify({node:process.version,cwd:process.cwd()},null,2))'],
});

export default defineProject({
	name: 'VS Code Markdown development',
	nodes: { runtimeInfo },
});
