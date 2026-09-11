/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAgentHostE2EChanges } from './detect.ts';

async function detect(files: { filename: string; previous_filename?: string }[], changedFiles = files.length, listError?: Error): Promise<string | undefined> {
	let affected: string | undefined;
	await detectAgentHostE2EChanges({
		paginate: async () => {
			if (listError) {
				throw listError;
			}
			return files;
		},
		rest: { pulls: { listFiles: {} } },
	}, {
		repo: { owner: 'microsoft', repo: 'vscode' },
		issue: { number: 1 },
		payload: { pull_request: { changed_files: changedFiles } },
	}, {
		info: () => { },
		warning: () => { },
		setOutput: (name, value) => {
			assert.equal(name, 'affected');
			affected = value;
		},
	});
	return affected;
}

test('includes real workbench and Copilot dependencies of the prompt capture', async () => {
	const paths = [
		'src/vs/workbench/contrib/browserView/electron-browser/tools/openBrowserTool.ts',
		'src/vs/workbench/common/contributions.ts',
		'src/vs/editor/common/model/textModel.ts',
		'src/vs/code/electron-main/main.ts',
		'extensions/copilot/src/extension/tools/node/toolSearchTool.ts',
		'extensions/copilot/src/extension/prompts/node/example.md',
		'extensions/copilot/package.json',
		'extensions/copilot/package.nls.json',
		'src/vs/platform/agentHost/test/node/e2e/providers/fixtures/instructions.md',
		'src/vs/platform/agentHost/test/node/e2e/providers/__snapshots__/model.prompt.md',
		'src/vs/platform/agentHost/test/node/e2e/captures/model.yaml',
	];
	for (const filename of paths) {
		assert.equal(await detect([{ filename }]), 'true', filename);
	}
});

test('keeps documentation-only and unrelated extension changes skippable', async () => {
	for (const filename of ['README.md', 'extensions/copilot/docs/monitoring.md', 'extensions/git/src/api.ts', 'src/vs/platform/agentHost/test/node/e2e/README.md']) {
		assert.equal(await detect([{ filename }]), 'false', filename);
	}
});

test('includes previous paths for renamed capture inputs', async () => {
	assert.equal(await detect([{ filename: 'archive/instructions.md', previous_filename: 'src/vs/platform/agentHost/test/node/e2e/providers/fixtures/instructions.md' }]), 'true');
});

test('runs tests when the change list is incomplete or unavailable', async () => {
	assert.equal(await detect([], 1), 'true');
	assert.equal(await detect([], 0, new Error('unavailable')), 'true');
});
