/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITextFileEditorModel, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { EditTool, EditToolParams } from '../../../common/tools/editFileTool.js';
import { IToolInvocationPreparationContext, ToolInvocationPresentation } from '../../../common/languageModelToolsService.js';

suite('EditTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let editTool: EditTool;
	let mockTextFileService: ITextFileService;
	let mockTextFileModel: ITextFileEditorModel;

	setup(() => {
		// Create a mock text file model
		mockTextFileModel = {
			isDirty: () => false,
		} as ITextFileEditorModel;

		// Create a mock text file service
		mockTextFileService = {
			files: {
				get: (uri: URI) => mockTextFileModel,
			},
			save: async (uri: URI) => uri,
		} as unknown as ITextFileService;

		// Create EditTool with mocked dependencies
		editTool = new EditTool(
			null as any, // IChatService - not needed for prepareToolInvocation tests
			null as any, // ICodeMapperService - not needed for prepareToolInvocation tests
			null as any, // INotebookService - not needed for prepareToolInvocation tests
			mockTextFileService
		);
	});

	test('prepareToolInvocation should return Hidden presentation when file is not dirty', async () => {
		const uri = URI.parse('file:///test/file.txt');
		const context: IToolInvocationPreparationContext = {
			parameters: {
				uri: uri.toJSON(),
				explanation: 'test',
				code: 'test code'
			} as EditToolParams
		};

		const result = await editTool.prepareToolInvocation(context, CancellationToken.None);

		assert.ok(result);
		assert.strictEqual(result.presentation, ToolInvocationPresentation.Hidden);
		assert.strictEqual(result.confirmationMessages, undefined);
	});

	test('prepareToolInvocation should request confirmation when file is dirty', async () => {
		// Make the model dirty
		mockTextFileModel = {
			isDirty: () => true,
		} as ITextFileEditorModel;

		mockTextFileService = {
			files: {
				get: (uri: URI) => mockTextFileModel,
			},
			save: async (uri: URI) => uri,
		} as unknown as ITextFileService;

		editTool = new EditTool(
			null as any,
			null as any,
			null as any,
			mockTextFileService
		);

		const uri = URI.parse('file:///test/file.txt');
		const context: IToolInvocationPreparationContext = {
			parameters: {
				uri: uri.toJSON(),
				explanation: 'test',
				code: 'test code'
			} as EditToolParams
		};

		const result = await editTool.prepareToolInvocation(context, CancellationToken.None);

		assert.ok(result);
		assert.strictEqual(result.presentation, ToolInvocationPresentation.Hidden);
		assert.ok(result.confirmationMessages);
		assert.ok(result.confirmationMessages.title);
		assert.ok(result.confirmationMessages.message);
		assert.strictEqual(result.confirmationMessages.allowAutoConfirm, true);
	});

	test('prepareToolInvocation should not request confirmation when file model does not exist', async () => {
		mockTextFileService = {
			files: {
				get: (uri: URI) => undefined,
			},
			save: async (uri: URI) => uri,
		} as unknown as ITextFileService;

		editTool = new EditTool(
			null as any,
			null as any,
			null as any,
			mockTextFileService
		);

		const uri = URI.parse('file:///test/file.txt');
		const context: IToolInvocationPreparationContext = {
			parameters: {
				uri: uri.toJSON(),
				explanation: 'test',
				code: 'test code'
			} as EditToolParams
		};

		const result = await editTool.prepareToolInvocation(context, CancellationToken.None);

		assert.ok(result);
		assert.strictEqual(result.presentation, ToolInvocationPresentation.Hidden);
		assert.strictEqual(result.confirmationMessages, undefined);
	});
});
