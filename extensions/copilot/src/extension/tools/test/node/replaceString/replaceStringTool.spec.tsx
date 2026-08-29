/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, expect, it, suite } from 'vitest';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { ChatResponseStreamImpl } from '../../../../../util/common/chatResponseStreamImpl';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { ResourceSet } from '../../../../../util/vs/base/common/map';
import { assertType } from '../../../../../util/vs/base/common/types';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseTextEditPart } from '../../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { WorkingCopyOriginalDocument } from '../../../../prompts/node/inline/workingCopies';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IReplaceStringToolParams, ReplaceStringTool } from '../../../node/replaceStringTool';


suite('ReplaceString Tool', () => {

	let accessor: ITestingServicesAccessor;

	const path = join(__dirname, 'fixtures/math.js.txt');
	const fileTsUri = URI.file(path);

	beforeEach(function () {
		const services = createExtensionUnitTestingServices();

		const content = String(readFileSync(path));

		const testDoc = createTextDocumentData(fileTsUri, content, 'ts').document;
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService, [[fileTsUri], [testDoc]]
		));

		accessor = services.createTestingAccessor();
	});

	it('whitespace change everywhere', async () => {

		const input: IReplaceStringToolParams = JSON.parse(`{
  "filePath": "${path.replaceAll('\\', '\\\\')}",
  "oldString": "export function div(a, b) {\\n  // console.log fff fff\\n  return a / b;\\n}",
  "newString": "export function div(A, b) {\\n  // console.log fff fff\\n  return A / b;\\n}"
}`);

		const tool = accessor.get(IInstantiationService).createInstance(ReplaceStringTool);

		expect(tool).toBeDefined();

		const document = accessor.get(IWorkspaceService).textDocuments.find(doc => doc.uri.toString() === fileTsUri.toString());
		assertType(document);

		const workingCopyDocument = new WorkingCopyOriginalDocument(document.getText());

		expect(document.getText().includes(input.oldString)).toBe(false); // TAB vs SPACES

		let seenEdits = 0;

		const stream = new ChatResponseStreamImpl((part) => {

			if (part instanceof ChatResponseTextEditPart) {
				const offsetEdits = workingCopyDocument.transformer.toOffsetEdit(part.edits);

				if (!workingCopyDocument.isNoop(offsetEdits)) {
					seenEdits++;
					workingCopyDocument.applyOffsetEdits(offsetEdits);
				}
			}

		}, () => { }, () => { }, undefined, undefined, () => Promise.resolve(undefined));

		const input2 = await tool.resolveInput(input, {
			history: [],
			stream,
			query: 'change a to A',
			chatVariables: new ChatVariablesCollection([]),
		});

		await tool.invoke({ input: input2, toolInvocationToken: undefined }, CancellationToken.None);

		expect(seenEdits).toBe(1);
		await expect(workingCopyDocument.text).toMatchFileSnapshot('fixtures/math.js.txt.expected');

	});

	it('should fail when input filePath resolves to URI outside allowedEditUris', async () => {
		const services = createExtensionUnitTestingServices();
		const settingsPath = join(__dirname, 'fixtures/settingsjson.txt');
		const inlineDocumentUri = URI.parse('vscode-userdata:/Users/jrieken/Library/Application%20Support/Code%20-%20Insiders/User/settings.json');
		const settingsUri = URI.file(settingsPath);

		const content = String(readFileSync(settingsPath));
		const testDoc = createTextDocumentData(settingsUri, content, 'jsonc').document;
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService, [[settingsUri], [testDoc]]
		));

		const localAccessor = services.createTestingAccessor();

		const input: IReplaceStringToolParams = JSON.parse(`{
	"filePath": "${settingsUri.path}",
  "oldString": "  \\"typescript.inlayHints.functionLikeReturnTypes.enabled\\": true,\\n  \\"typescript.inlayHints.parameterTypes.enabled\\": true,\\n  \\"typescript.inlayHints.propertyDeclarationTypes.enabled\\": true,\\n  \\"typescript.inlayHints.variableTypes.enabled\\": true,\\n  // \\"typescript.referencesCodeLens.enabled\\": true,\\n  \\"typescript.preferences.useAliasesForRenames\\": false,\\n  \\"typescript.referencesCodeLens.enabled\\": false,\\n  \\"js/ts.tsserver.log\\": \\"off\\",\\n  \\"typescript.updateImportsOnFileMove.enabled\\": \\"always\\",",
  "newString": "  \\"js/ts.inlayHints.functionLikeReturnTypes.enabled\\": true,\\n  \\"js/ts.inlayHints.parameterTypes.enabled\\": true,\\n  \\"js/ts.inlayHints.propertyDeclarationTypes.enabled\\": true,\\n  \\"js/ts.inlayHints.variableTypes.enabled\\": true,\\n  // \\"js/ts.referencesCodeLens.enabled\\": true,\\n  \\"js/ts.preferences.useAliasesForRenames\\": false,\\n  \\"js/ts.referencesCodeLens.enabled\\": false,\\n  \\"js/ts.tsserver.log\\": \\"off\\",\\n  \\"js/ts.updateImportsOnFileMove.enabled\\": \\"always\\","
}`);

		const tool = localAccessor.get(IInstantiationService).createInstance(ReplaceStringTool);
		expect(tool).toBeDefined();

		const document = localAccessor.get(IWorkspaceService).textDocuments.find(doc => doc.uri.toString() === settingsUri.toString());
		assertType(document);

		const workingCopyDocument = new WorkingCopyOriginalDocument(document.getText());
		expect(document.getText().includes(input.oldString)).toBe(true);

		let seenEdits = 0;

		const stream = new ChatResponseStreamImpl((part) => {
			if (part instanceof ChatResponseTextEditPart) {
				const offsetEdits = workingCopyDocument.transformer.toOffsetEdit(part.edits);

				if (!workingCopyDocument.isNoop(offsetEdits)) {
					seenEdits++;
					workingCopyDocument.applyOffsetEdits(offsetEdits);
				}
			}
		}, () => { }, () => { }, undefined, undefined, () => Promise.resolve(undefined));

		const input2 = await tool.resolveInput(input, {
			history: [],
			stream,
			query: 'fix deprecated settings keys',
			chatVariables: new ChatVariablesCollection([]),
			allowedEditUris: new ResourceSet([inlineDocumentUri]),
		});

		const result = await tool.invoke({ input: input2, toolInvocationToken: undefined }, CancellationToken.None);

		expect(result.hasError).toBe(true);
		expect(seenEdits).toBe(0);
		expect(workingCopyDocument.text).toBe(document.getText());
	});
});
