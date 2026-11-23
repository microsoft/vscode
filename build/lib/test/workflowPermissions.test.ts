/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

type Permissions = Readonly<Record<string, 'read' | 'write' | 'none'>>;

interface IWorkflow {
	readonly permissions?: Permissions;
	readonly jobs: Record<string, { readonly permissions?: Permissions }>;
}

function jobPermissions(file: string): Record<string, Permissions | undefined> {
	const workflow = load(readFileSync(path.join(repositoryRoot, '.github/workflows', file), 'utf8')) as IWorkflow;
	return Object.fromEntries(Object.entries(workflow.jobs).map(([id, job]) => [id, job.permissions ?? workflow.permissions]));
}

suite('Workflow permissions', () => {
	test('PR jobs only receive the repository scopes their steps use', () => {
		const contents = { contents: 'read' };
		const workspaceImage = { contents: 'read', actions: 'read' };
		assert.deepStrictEqual(jobPermissions('pr.yml'), {
			'changes': { contents: 'read', 'pull-requests': 'read' },
			'compile': workspaceImage,
			'monaco-editor': workspaceImage,
			'telemetry': {},
			'ripple': {},
			'linux-rust-tests': contents,
			'linux-tests': workspaceImage,
			'windows-tests': workspaceImage,
			'copilot-check-test-cache': { ...workspaceImage, 'pull-requests': 'read' },
			'copilot-check-telemetry': contents,
			'copilot-linux-tests': workspaceImage,
			'copilot-windows-tests': workspaceImage,
			'chat-lib-linux-tests': workspaceImage,
			'chat-lib-windows-tests': workspaceImage,
			'cancel-run': { actions: 'write' },
			'pr-gate': {},
		});
	});

	test('only the screenshot job can comment and request an OIDC token', () => {
		assert.deepStrictEqual(jobPermissions('component-fixtures.yml'), {
			playwright: { contents: 'read', actions: 'read' },
			screenshots: { contents: 'read', actions: 'read', 'pull-requests': 'write', 'id-token': 'write' },
			'component-fixtures': {},
		});
	});

	test('test jobs without workspace images and CodeQL without private packs omit unused scopes', () => {
		assert.deepStrictEqual({
			macOS: Object.values(jobPermissions('pr-darwin-test.yml')),
			wsl: jobPermissions('pr-win32-test.yml')['electron-smoke-wsl'],
			codeql: jobPermissions('codeql.yml').analyze,
		}, {
			macOS: Array.from({ length: 7 }, () => ({ contents: 'read' })),
			wsl: { contents: 'read' },
			codeql: { actions: 'read', contents: 'read', 'security-events': 'write' },
		});
	});

	test('source map uploads use the Azure CLI login without exporting service principal credentials', () => {
		const pipeline = load(readFileSync(path.join(repositoryRoot, 'build/azure-pipelines/copilot/upload-sourcemaps-steps.yml'), 'utf8')) as {
			steps: { task?: string; inputs?: { addSpnToEnvironment?: boolean; inlineScript?: string } }[];
		};
		const upload = pipeline.steps.find(step => step.task === 'AzureCLI@2')?.inputs;
		assert.ok(upload);
		assert.deepStrictEqual({
			exportsCredentials: upload.addSpnToEnvironment ?? false,
			usesCliLogin: upload.inlineScript?.includes('--auth-mode login'),
		}, {
			exportsCredentials: false,
			usesCliLogin: true,
		});
	});
});
