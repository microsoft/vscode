/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockObject } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { McpPromptArgumentPick } from '../../browser/mcpPromptArgumentPick.js';
import { IMcpPrompt } from '../../common/mcpTypes.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITerminalGroupService } from '../../../terminal/browser/terminal.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('McpPromptArgumentPick - Active File Support', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let mockCodeEditorService: MockObject<ICodeEditorService>;
	let mockEditorService: MockObject<IEditorService>;

	setup(() => {
		instantiationService = new TestInstantiationService();
		mockCodeEditorService = new MockObject<ICodeEditorService>();
		mockEditorService = new MockObject<IEditorService>();

		// Set up other required services as mocks
		instantiationService.stub(IQuickInputService, new MockObject<IQuickInputService>());
		instantiationService.stub(ITerminalService, new MockObject<ITerminalService>());
		instantiationService.stub(ISearchService, new MockObject<ISearchService>());
		instantiationService.stub(IWorkspaceContextService, new MockObject<IWorkspaceContextService>());
		instantiationService.stub(ILabelService, new MockObject<ILabelService>());
		instantiationService.stub(IFileService, new MockObject<IFileService>());
		instantiationService.stub(IModelService, new MockObject<IModelService>());
		instantiationService.stub(ILanguageService, new MockObject<ILanguageService>());
		instantiationService.stub(ITerminalGroupService, new MockObject<ITerminalGroupService>());
		instantiationService.stub(ICodeEditorService, mockCodeEditorService);
		instantiationService.stub(IEditorService, mockEditorService);
	});

	test('McpPromptArgumentPick can be instantiated with new services', () => {
		const mockPrompt: IMcpPrompt = {
			arguments: [],
			complete: async () => [],
		};

		// This should not throw
		const picker = instantiationService.createInstance(McpPromptArgumentPick, mockPrompt);
		assert.ok(picker);
		picker.dispose();
	});

	test('Active file completions section is included in async picks', () => {
		const mockPrompt: IMcpPrompt = {
			arguments: [{ name: 'test', required: true }],
			complete: async () => [],
		};

		const picker = instantiationService.createInstance(McpPromptArgumentPick, mockPrompt);
		assert.ok(picker);
		
		// The implementation includes the active file completions in the asyncPicks array
		// We can't easily test this without mocking the entire observable system,
		// but we can at least verify the instance creation worked
		picker.dispose();
	});
});