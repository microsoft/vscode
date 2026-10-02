/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeParsedArgs } from '../../../environment/common/argv.js';
import { AgentsWindowOpenSource } from '../../../window/common/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
import { resolveAgentsWindowFolder } from '../../electron-main/agentsWindow.js';
import { IOpenConfiguration, OpenContext } from '../../electron-main/windows.js';

suite('Agents window CLI folder', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.file('/project');
	const resolvedFolder = { workspace: { id: 'project', uri: folder } };

	async function resolveFolder(options: {
		cli?: NativeParsedArgs;
		context?: OpenContext;
		initialStartup?: boolean;
		folderUri?: URI;
		sessionResource?: URI;
		source?: AgentsWindowOpenSource;
		paths?: readonly { readonly workspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier }[];
	} = {}) {
		const calls: NativeParsedArgs[] = [];
		const openConfig: IOpenConfiguration = {
			context: options.context ?? OpenContext.CLI,
			cli: options.cli ?? { _: ['/project'], agents: true },
			initialStartup: options.initialStartup,
		};
		const result = await resolveAgentsWindowFolder(openConfig, options.folderUri, options.sessionResource, options.source, async cli => {
			calls.push(cli);
			return options.paths ?? [resolvedFolder];
		});
		return { folder: result?.toString(), calls };
	}

	for (const initialStartup of [true, false]) {
		test(`selects a CLI folder on ${initialStartup ? 'initial' : 'subsequent'} launch`, async () => {
			assert.deepStrictEqual(await resolveFolder({ initialStartup }), {
				folder: folder.toString(),
				calls: [{ _: ['/project'], agents: true }],
			});
		});
	}

	test('passes relative paths to the existing CLI resolver', async () => {
		const cli = { _: ['./project'], agents: true };
		assert.deepStrictEqual(await resolveFolder({ cli }), { folder: folder.toString(), calls: [cli] });
	});

	test('passes folder URIs to the existing CLI resolver', async () => {
		const cli = { _: [], agents: true, 'folder-uri': [folder.toString()] };
		assert.deepStrictEqual(await resolveFolder({ cli }), { folder: folder.toString(), calls: [cli] });
	});

	test('preserves opening without a resolved folder', async () => {
		const cli = { _: [], agents: true };
		assert.deepStrictEqual(await resolveFolder({ cli, paths: [] }), { folder: undefined, calls: [cli] });
	});

	test('selects the first folder, not files or multi-root workspaces', async () => {
		assert.deepStrictEqual(await resolveFolder({
			paths: [
				{},
				{ workspace: { id: 'multi-root', configPath: URI.file('/project.code-workspace') } },
				resolvedFolder,
				{ workspace: { id: 'second', uri: URI.file('/second') } },
			],
		}), { folder: folder.toString(), calls: [{ _: ['/project'], agents: true }] });
	});

	test('does not select files or multi-root workspaces as folders', async () => {
		assert.deepStrictEqual(await resolveFolder({
			paths: [{}, { workspace: { id: 'multi-root', configPath: URI.file('/project.code-workspace') } }],
		}), { folder: undefined, calls: [{ _: ['/project'], agents: true }] });
	});

	test('preserves an explicit folder over CLI arguments', async () => {
		const explicitFolder = URI.file('/explicit');
		assert.deepStrictEqual(await resolveFolder({ folderUri: explicitFolder }), { folder: explicitFolder.toString(), calls: [] });
	});

	test('preserves an existing-session intent over CLI arguments', async () => {
		assert.deepStrictEqual(await resolveFolder({ sessionResource: URI.parse('agent-host://session/123') }), { folder: undefined, calls: [] });
	});

	test('does not use inherited CLI arguments for a link intent', async () => {
		assert.deepStrictEqual(await resolveFolder({ source: AgentsWindowOpenSource.Link }), { folder: undefined, calls: [] });
	});

	for (const context of [OpenContext.API, OpenContext.DESKTOP, OpenContext.LINK]) {
		test(`does not use inherited CLI arguments in context ${context}`, async () => {
			assert.deepStrictEqual(await resolveFolder({ context }), { folder: undefined, calls: [] });
		});
	}

	test('does not infer a folder without the agents flag', async () => {
		assert.deepStrictEqual(await resolveFolder({ cli: { _: ['/project'] } }), { folder: undefined, calls: [] });
	});

	test('accepts an explicit command-line source', async () => {
		assert.deepStrictEqual(await resolveFolder({ source: AgentsWindowOpenSource.CommandLine }), {
			folder: folder.toString(),
			calls: [{ _: ['/project'], agents: true }],
		});
	});
});
