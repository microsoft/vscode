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
import { assertType } from '../../../../../util/vs/base/common/types';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseTextEditPart } from '../../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { WorkingCopyOriginalDocument } from '../../../../prompts/node/inline/workingCopies';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ApplyPatchTool, IApplyPatchToolParams } from '../../../node/applyPatchTool';


suite('ApplyPatch Tool', () => {

	let accessor: ITestingServicesAccessor;

	const path = join(__dirname, 'fixtures/4302.ts.txt');
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

	it('makes changes atomically', async () => {

		const input: IApplyPatchToolParams = JSON.parse(`{
  "explanation": "Condense the offSide language array and includes check into a single line.",
  "input": "*** Begin Patch\\n*** Update File: ${path.replaceAll('\\', '\\\\')}\\n@@\\n-\\tconst offSide = [\\n-\\t\\t'clojure',\\n-\\t\\t'coffeescript',\\n-\\t\\t'fsharp',\\n-\\t\\t'latex',\\n-\\t\\t'markdown',\\n-\\t\\t'pug',\\n-\\t\\t'python',\\n-\\t\\t'sql',\\n-\\t\\t'yaml',\\n-\\t].includes(languageId.toLowerCase());\\n+\\tconst offSide = ['clojure','coffeescript','fsharp','latex','markdown','pug','python','sql','yaml'].includes(languageId.toLowerCase());\\n*** End Patch\\n"
}`);

		const tool = accessor.get(IInstantiationService).createInstance(ApplyPatchTool);

		expect(tool).toBeDefined();

		const document = accessor.get(IWorkspaceService).textDocuments.find(doc => doc.uri.toString() === fileTsUri.toString());
		assertType(document);

		const workingCopyDocument = new WorkingCopyOriginalDocument(document.getText());

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
			query: 'put it all in one line',
			chatVariables: new ChatVariablesCollection([]),
		});

		await tool.invoke({ input: input2, toolInvocationToken: undefined }, CancellationToken.None);

		expect(seenEdits).toBe(1);
		await expect(workingCopyDocument.text).toMatchFileSnapshot('fixtures/4302.ts.txt.expected');

	});
});
