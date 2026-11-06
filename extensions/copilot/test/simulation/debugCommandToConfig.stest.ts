/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import path from 'path';
import { DebugCommandToConfigConverter } from '../../src/extension/onboardDebug/node/commandToConfigConverter';
import { IGitExtensionService } from '../../src/platform/git/common/gitExtensionService';
import { API } from '../../src/platform/git/vscode/git';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { TestWorkspaceService } from '../../src/platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../src/platform/workspace/common/workspaceService';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { Event } from '../../src/util/vs/base/common/event';
import { URI } from '../../src/util/vs/base/common/uri';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { rubric } from '../base/rubric';
import { ssuite, stest } from '../base/stest';

ssuite({ title: 'Debug config to command', location: 'context' }, () => {

	const WORKSPACE_FOLDER = URI.file('/workspace');

	async function score(testingServiceCollection: TestingServiceCollection, cwd: string, args: string[]) {
		testingServiceCollection.define(IGitExtensionService, new SyncDescriptor(class implements IGitExtensionService {
			_serviceBrand: undefined;
			onDidChange = Event.None;
			extensionAvailable: boolean = false;
			getExtensionApi(): API | undefined {
				return undefined;
			}
		}));
		const accessor = testingServiceCollection.createTestingAccessor();
		(accessor.get(IWorkspaceService) as TestWorkspaceService).getWorkspaceFolders().push(WORKSPACE_FOLDER);

		const cvt = accessor.get(IInstantiationService).createInstance(DebugCommandToConfigConverter);
		const result = await cvt.convert(cwd, args, CancellationToken.None);
		if (!result.ok) {
			throw new Error('Expected tools to be found');
		}

		return { accessor, r: result.config?.configurations[0] };
	}

	stest({ description: 'node test' }, async (testingServiceCollection) => {
		const { accessor, r } = await score(testingServiceCollection, WORKSPACE_FOLDER.fsPath, ['node', 'index.js']);

		rubric(accessor,
			() => assert.ok(r?.type === 'node'),
			() => assert.ok(r?.program.endsWith('index.js')),
			() => assert.ok(!r?.cwd || r?.cwd === '${workspaceFolder}'),
		);
	});

	stest({ description: 'node subdirectory and arg' }, async (testingServiceCollection) => {
		const { accessor, r } = await score(testingServiceCollection, path.join(WORKSPACE_FOLDER.fsPath, 'foo'), ['node', 'index', '--my-arg']);

		rubric(accessor,
			() => assert.ok(r?.type === 'node'),
			() => assert.ok(r?.program.endsWith('index.js')),
			() => assert.ok(r?.cwd.endsWith('foo')),
			() => assert.deepStrictEqual(r?.args, ['--my-arg']),
		);
	});

	stest({ description: 'python3 subdirectory and arg' }, async (testingServiceCollection) => {
		const { accessor, r } = await score(testingServiceCollection, path.join(WORKSPACE_FOLDER.fsPath, 'foo'), ['python3', 'cool.py', '--my-arg']);

		rubric(accessor,
			() => assert.ok(r?.type === 'python' || r?.type === 'debugpy'),
			() => assert.ok(r?.program.endsWith('cool.py')),
			() => assert.ok(r?.cwd.endsWith('foo')),
			() => assert.deepStrictEqual(r?.args, ['--my-arg']),
		);
	});

	stest({ description: 'opening a browser' }, async (testingServiceCollection) => {
		const { accessor, r } = await score(testingServiceCollection, path.join(WORKSPACE_FOLDER.fsPath), ['chrome.exe', 'https://microsoft.com']);

		rubric(accessor,
			() => assert.ok(r?.type === 'chrome'),
			() => assert.deepStrictEqual(r?.url, 'https://microsoft.com'),
		);
	});

	stest({ description: 'cargo run platform-specific' }, async (testingServiceCollection) => {
		const { accessor, r } = await score(testingServiceCollection, path.join(WORKSPACE_FOLDER.fsPath), ['cargo', 'run']);

		rubric(accessor,
			// test env service always advertises linux:
			() => assert.strictEqual(r?.type, 'lldb'),
			() => assert.ok(r?.program.includes('target/debug')),
		);
	});
});
