/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelDataPart, MarkdownString } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IViewImageParams, ViewImageTool } from '../viewImageTool';
import { toolResultToString } from './toolTestUtils';

suite('ViewImage', () => {
	test('returns image data for image file', async () => {
		const services = createExtensionUnitTestingServices();
		const mockFs = new MockFileSystemService();
		mockFs.mockFile(URI.file('/workspace/photo.jpg'), 'fake-image-bytes');
		services.define(IFileSystemService, mockFs);
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[[URI.file('/workspace')], []]
		));

		const accessor = services.createTestingAccessor();
		const viewImageTool = accessor.get(IInstantiationService).createInstance(ViewImageTool);

		const input: IViewImageParams = { filePath: '/workspace/photo.jpg' };
		const result = await viewImageTool.invoke(
			{ input, toolInvocationToken: null as never },
			CancellationToken.None
		);

		const imagePart = result.content.find(part => part instanceof LanguageModelDataPart);
		expect(imagePart).toBeDefined();
		expect((imagePart as LanguageModelDataPart).mimeType).toBe('image/jpeg');

		accessor.dispose();
	});

	test('returns error for oversized image files', async () => {
		const services = createExtensionUnitTestingServices();
		const mockFs = new class extends MockFileSystemService {
			override async stat(resource: URI) {
				const result = await super.stat(resource);
				if (resource.toString() === URI.file('/workspace/huge.png').toString()) {
					return { ...result, size: 21 * 1024 * 1024 };
				}
				return result;
			}
		}();
		mockFs.mockFile(URI.file('/workspace/huge.png'), 'fake-image-bytes');
		services.define(IFileSystemService, mockFs);
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[[URI.file('/workspace')], []]
		));

		const accessor = services.createTestingAccessor();
		const viewImageTool = accessor.get(IInstantiationService).createInstance(ViewImageTool);

		const input: IViewImageParams = { filePath: '/workspace/huge.png' };
		const result = await viewImageTool.invoke(
			{ input, toolInvocationToken: null as never },
			CancellationToken.None
		);

		const text = await toolResultToString(accessor, result);
		expect(text).toContain('exceeds the maximum allowed size');

		accessor.dispose();
	});

	test('prepareInvocation returns image-specific messages', async () => {
		const services = createExtensionUnitTestingServices();
		const mockFs = new MockFileSystemService();
		mockFs.mockFile(URI.file('/workspace/icon.png'), 'fake-image-data');
		services.define(IFileSystemService, mockFs);
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[[URI.file('/workspace')], []]
		));

		const accessor = services.createTestingAccessor();
		const viewImageTool = accessor.get(IInstantiationService).createInstance(ViewImageTool);

		const input: IViewImageParams = { filePath: '/workspace/icon.png' };
		const result = await viewImageTool.prepareInvocation(
			{ input },
			CancellationToken.None
		);

		expect(result).toBeDefined();
		expect((result!.invocationMessage as MarkdownString).value).toContain('Viewing image');
		expect((result!.pastTenseMessage as MarkdownString).value).toContain('Viewed image');

		accessor.dispose();
	});

	test('throws for non-image files and points to read_file', async () => {
		const document = createTextDocumentData(URI.file('/workspace/file.ts'), 'const x = 1;', 'typescript').document;

		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[[URI.file('/workspace')], [document]]
		));

		const accessor = services.createTestingAccessor();
		const viewImageTool = accessor.get(IInstantiationService).createInstance(ViewImageTool);

		const input: IViewImageParams = { filePath: '/workspace/file.ts' };
		await expect(viewImageTool.prepareInvocation(
			{ input },
			CancellationToken.None
		)).rejects.toThrow('Use read_file for non-image files');

		accessor.dispose();
	});
});
