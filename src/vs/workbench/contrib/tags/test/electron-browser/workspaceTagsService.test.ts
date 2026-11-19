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

	for (const [dependency, family] of [
		['@azure/arm-containerservice', '@azure/arm'],
		['@azure/cognitiveservices-computervision', '@azure/cognitiveservices'],
		['@azure/communication-email', '@azure/communication'],
		['@azure/functions', '@azure/functions'],
		['@azure/monitor-opentelemetry', '@azure/monitor'],
		['@azure/provisioning-storage', '@azure/provisioning']
	]) {
		test(`uses ${family} family tag for ${dependency}`, async () => {
			assert.deepStrictEqual(await npmTags([dependency]), {
				'workspace.npm.@azure': true,
				[`workspace.npm.${family}`]: true
			});
		});
	}

	test('records exact Azure SDK tags without family fallbacks', async () => {
		const dependencies = [
			'@azure/ai-agents',
			'@azure/ai-content-safety',
			'@azure/ai-content-understanding',
			'@azure/ai-discovery',
			'@azure/ai-projects',
			'@azure/ai-speech-transcription',
			'@azure/ai-translation-document',
			'@azure/ai-vision-face-ui',
			'@azure/ai-voicelive',
			'@azure/identity-broker',
			'@azure/identity-cache-persistence',
			'@azure/identity-vscode',
			'@azure/keyvault-common',
			'@azure/storage-common',
			'@azure/arm-apicenter',
			'@azure/arm-search',
			'@azure/arm-batch',
			'@azure/arm-compute',
			'@azure/arm-containerinstance',
			'@azure/arm-containerregistry',
			'@azure/arm-cosmosdb',
			'@azure/arm-keyvault',
			'@azure/arm-network',
			'@azure/arm-resources',
			'@azure/arm-storage',
			'@azure/openai-assistants',
			'@azure-rest/agrifood-farming',
			'@azure-rest/ai-translation-document',
			'@azure-rest/ai-vision-face',
			'@azure-rest/arm-compute',
			'@azure-rest/arm-containerservice',
			'@azure-rest/arm-network',
			'@azure-rest/arm-servicefabric',
			'@azure-rest/batch',
			'@azure-rest/communication-job-router',
			'@azure-rest/communication-messages',
			'@azure-rest/confidential-ledger',
			'@azure-rest/core-client',
			'@azure-rest/core-client-lro',
			'@azure-rest/core-client-paging',
			'@azure-rest/defender-easm',
			'@azure-rest/developer-devcenter',
			'@azure-rest/health-deidentification',
			'@azure-rest/health-insights-cancerprofiling',
			'@azure-rest/health-insights-clinicalmatching',
			'@azure-rest/health-insights-radiologyinsights',
			'@azure-rest/iot-device-update',
			'@azure-rest/load-testing',
			'@azure-rest/maps-geolocation',
			'@azure-rest/maps-render',
			'@azure-rest/maps-route',
			'@azure-rest/maps-search',
			'@azure-rest/maps-timezone',
			'@azure-rest/onlineexperimentation',
			'@azure-rest/purview-account',
			'@azure-rest/purview-administration',
			'@azure-rest/purview-catalog',
			'@azure-rest/purview-datamap',
			'@azure-rest/purview-scanning',
			'@azure-rest/purview-sharing',
			'@azure-rest/purview-workflow'
		];
		assert.deepStrictEqual(await npmTags(dependencies), Object.fromEntries(dependencies.map(dependency => [`workspace.npm.${dependency}`, true])));
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
