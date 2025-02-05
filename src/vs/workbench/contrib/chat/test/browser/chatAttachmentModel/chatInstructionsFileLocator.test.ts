/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { mockObject, mockService } from '../../common/promptSyntax/testUtils/mock.js';
import { PromptFilesConfig } from '../../../common/promptSyntax/config.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatInstructionsFileLocator } from '../../../browser/chatAttachmentModel/chatInstructionsFileLocator.js';

/**
 * Mocked mocked instance of {@link IConfigurationService}.
 */
const mockConfigService = <T>(value: T): IConfigurationService => {
	return mockService<IConfigurationService>({
		getValue(key?: string | IConfigurationOverrides) {
			assert.strictEqual(
				key,
				PromptFilesConfig.CONFIG_KEY,
				`Mocked service supports only one configuration key: '${PromptFilesConfig.CONFIG_KEY}'.`,
			);

			return value;
		},
	});
};

/**
 * Mocked mocked instance of {@link IWorkspaceContextService}.
 */
const mockWorkspaceService = (folders: IWorkspaceFolder[]): IWorkspaceContextService => {
	return mockService<IWorkspaceContextService>({
		getWorkspace(): IWorkspace {
			return mockObject<IWorkspace>({
				folders,
			});
		},
	});
};

suite('ChatInstructionsFileLocator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let initService: TestInstantiationService;
	setup(async () => {
		initService = disposables.add(new TestInstantiationService());
		initService.stub(ILogService, new NullLogService());

		const fileService = disposables.add(initService.createInstance(FileService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		initService.stub(IFileService, fileService);
	});

	/**
	 * Create a new instance of {@link ChatInstructionsFileLocator} with provided mocked
	 * values for configuration and workspace services.
	 */
	const createLocator = (
		configValue: unknown,
		workspaceFolders: IWorkspaceFolder[],
	): ChatInstructionsFileLocator => {
		initService.stub(IConfigurationService, mockConfigService(configValue));
		initService.stub(IWorkspaceContextService, mockWorkspaceService(workspaceFolders));

		return initService.createInstance(ChatInstructionsFileLocator);
	};

	suite('empty workspace', () => {
		test('no config value', async () => {
			const locator = createLocator(undefined, []);

			assert.deepStrictEqual(
				await locator.listFiles([]),
				[],
				'No prompts must be found.',
			);
		});

		test('object config value but no referenced folder', async () => {
			const locator = createLocator({
				"/Users/legomushroom/repos/prompts/": true,
				"/tmp/prompts/": false,
			}, []);

			assert.deepStrictEqual(
				await locator.listFiles([]),
				[],
				'No prompts must be found.',
			);
		});
	});
});
