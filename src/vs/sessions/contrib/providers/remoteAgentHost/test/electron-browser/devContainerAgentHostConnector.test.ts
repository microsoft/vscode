/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDevContainerAgentHostMainService } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isDevContainerWorkspaceAvailable } from '../../electron-browser/devContainerAgentHostConnector.contribution.js';

suite('Dev Container Agent Host Connector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('requires Docker and a default Dev Container configuration', async () => {
		const workspaceUri = URI.file('/workspace');
		const check = (existingPaths: readonly string[], dockerAvailable: boolean, uri = workspaceUri) => {
			const fileService = new class extends mock<IFileService>() {
				override async exists(resource: URI): Promise<boolean> {
					return existingPaths.includes(resource.path);
				}
			}();
			const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
				override async isDockerAvailable(): Promise<boolean> {
					return dockerAvailable;
				}
			}();
			return isDevContainerWorkspaceAvailable(uri, fileService, mainService);
		};

		assert.deepStrictEqual({
			nestedConfig: await check(['/workspace/.devcontainer/devcontainer.json'], true),
			rootConfig: await check(['/workspace/.devcontainer.json'], true),
			noDocker: await check(['/workspace/.devcontainer/devcontainer.json'], false),
			noConfig: await check([], true),
			nonFileWorkspace: await check(['/workspace/.devcontainer/devcontainer.json'], true, URI.parse('vscode-remote://host/workspace')),
		}, {
			nestedConfig: true,
			rootConfig: true,
			noDocker: false,
			noConfig: false,
			nonFileWorkspace: false,
		});
	});
});
