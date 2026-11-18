/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { changedPaths, listChangedFiles, shouldSkipTestJobs, type IChangedFiles, type IContext, type ICore, type IGitHub } from '../detect-changes/detect.ts';

const exactPaths = new Set([
	'.nvmrc',
	'.pnpmfile.mjs',
	'package.json',
	'pnpm-lock.yaml',
	'pnpm-workspace.yaml',
	'product.json',
	'scripts/test-agent-host-e2e.sh',
	'scripts/test-agent-host-e2e.bat',
	'scripts/test-integration.sh',
	'scripts/test-integration.bat',
	'scripts/test.sh',
	'scripts/test.bat',
	'src/vs/nls.ts',
]);

const pathPrefixes = [
	'.github/actions/detect-agent-host-e2e-changes/',
	'.github/workflows/pr',
	'build/',
	'src/bootstrap',
	'src/tsconfig',
	'src/vs/base/',
	'src/vs/platform/',
	'test/unit/electron/',
	'test/integration/agentHost/',
];

const fullProfilePaths = new Set([...exactPaths].filter(path => path !== 'src/vs/nls.ts'));
const fullProfilePrefixes = [
	'.github/actions/detect-agent-host-e2e-changes/',
	'.github/workflows/pr',
	'build/',
	'src/vs/platform/agentHost/test/',
	'test/unit/electron/',
	'test/integration/agentHost/',
];

function requiresFullProfile(path: string): boolean {
	// Only Compile & Hygiene reads these paths, including the package.json files in them, such as those of the
	// self-hosting extensions in .vscode/extensions/ and of test/sanity/ (see shouldSkipTestJobs).
	if (shouldSkipTestJobs(path)) {
		return false;
	}
	return fullProfilePaths.has(path)
		|| fullProfilePrefixes.some(prefix => path.startsWith(prefix))
		// package-lock.json remains in the folders that still install with npm (build/agent-sdk/agents/*).
		|| /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.pnpmfile\.mjs)$/.test(path);
}

function affectsAgentHostE2E(path: string): boolean {
	if (path.endsWith('.md') || shouldSkipTestJobs(path)) {
		return false;
	}
	return exactPaths.has(path) || pathPrefixes.some(prefix => path.startsWith(prefix));
}

export async function detectAgentHostE2EChanges(github: IGitHub, context: IContext, core: ICore): Promise<void> {
	let changedFiles: IChangedFiles;
	try {
		changedFiles = await listChangedFiles(github, context);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const reason = `Unable to list the changed files; running the full Agent Host test profile. ${message}`;
		core.warning(reason);
		core.setOutput('affected', 'true');
		core.setOutput('profile', 'full');
		core.setOutput('reason', 'Changed-file lookup failed');
		return;
	}

	const { files, incomplete } = changedFiles;
	const paths = changedPaths(files);
	const fullProfilePath = paths.find(requiresFullProfile);
	const affected = incomplete !== undefined || fullProfilePath !== undefined || paths.some(affectsAgentHostE2E);
	const profile = incomplete !== undefined || fullProfilePath !== undefined ? 'full' : 'pr';
	const reason = incomplete !== undefined ? 'Changed-file lookup was incomplete'
		: fullProfilePath !== undefined ? `Test, dependency, or infrastructure change: ${fullProfilePath}`
			: affected ? 'Relevant implementation changes'
				: 'No changes affect the parallel E2E suites';

	if (incomplete !== undefined) {
		core.warning(`GitHub ${incomplete}; running the full Agent Host test profile.`);
	} else {
		core.info(affected
			? 'Agent Host E2E tests may be affected.'
			: 'No changes can affect Agent Host E2E tests.');
	}
	core.info(`Agent Host test profile: ${profile} (${reason})`);
	core.setOutput('affected', affected ? 'true' : 'false');
	core.setOutput('profile', profile);
	core.setOutput('reason', reason);
}
