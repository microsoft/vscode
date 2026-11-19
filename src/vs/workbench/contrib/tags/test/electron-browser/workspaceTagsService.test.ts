/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { createFileStat } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceTagsService } from '../../electron-browser/workspaceTagsService.js';

suite('Telemetry - WorkspaceTagsService', () => {
	async function npmTags(dependencies: string[]) {
		const folder = URI.parse('test:/workspace');
		const packageJson = URI.joinPath(folder, 'package.json');
		const fileService = upcastPartial<IFileService>({
			exists: async resource => isEqual(resource, packageJson),
			resolveAll: async () => [{
				success: true,
				stat: createFileStat(folder, false, false, true, false, [{ resource: packageJson }])
			}]
		});
		const contextService = upcastPartial<IWorkspaceContextService>({
			getWorkbenchState: () => WorkbenchState.FOLDER,
			getWorkspace: () => testWorkspace(folder)
		});
		const environmentService = upcastPartial<IWorkbenchEnvironmentService>({
			workspaceStorageHome: URI.parse('test:/storage')
		});
		const textFileService = upcastPartial<ITextFileService>({
			read: async resource => ({
				...createFileStat(resource),
				value: JSON.stringify({ dependencies: Object.fromEntries(dependencies.map(dependency => [dependency, '*'])) }),
				encoding: 'utf8'
			})
		});
		const service = new WorkspaceTagsService(fileService, contextService, environmentService, textFileService);
		const tags = await service.getTags();
		return Object.fromEntries(Object.entries(tags).filter(([key]) => key.startsWith('workspace.npm.')));
	}

	test('uses family tags for bare Azure packages', async () => {
		assert.deepStrictEqual(await npmTags(['@azure/identity', '@azure/keyvault', '@azure/search']), {
			'workspace.npm.@azure': true,
			'workspace.npm.@azure/identity': true,
			'workspace.npm.@azure/keyvault': true,
			'workspace.npm.@azure/search': true
		});
	});

	test('records exact Azure SDK tags without family fallbacks', async () => {
		assert.deepStrictEqual(await npmTags([
			'@azure/ai-content-safety',
			'@azure/ai-discovery',
			'@azure/ai-translation-document',
			'@azure-rest/core-client'
		]), {
			'workspace.npm.@azure/ai-content-safety': true,
			'workspace.npm.@azure/ai-discovery': true,
			'workspace.npm.@azure/ai-translation-document': true,
			'workspace.npm.@azure-rest/core-client': true
		});
	});

	test('limits the Azure REST fallback to its package scope', async () => {
		assert.deepStrictEqual(await Promise.all([
			npmTags(['@azure-rest/new-package']),
			npmTags(['@azure-rest-other/new-package'])
		]), [{
			'workspace.npm.@azure': true,
			'workspace.npm.@azure-rest': true
		}, {
			'workspace.npm.@azure': true
		}]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
