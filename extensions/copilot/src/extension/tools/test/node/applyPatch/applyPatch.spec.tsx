/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, expect, it, suite } from 'vitest';
import { IIgnoreService, NullIgnoreService } from '../../../../../platform/ignore/common/ignoreService';
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
import { ChatResponseTextEditPart, ExtendedLanguageModelToolResult } from '../../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { WorkingCopyOriginalDocument } from '../../../../prompts/node/inline/workingCopies';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ApplyPatchTool, healedPatchAffectsSameFiles, IApplyPatchToolParams } from '../../../node/applyPatchTool';


class TestIgnoreService extends NullIgnoreService {
	readonly checkedUris: string[] = [];

	constructor(private readonly ignoredUris: ResourceSet) {
		super();
	}

	override async isCopilotIgnored(file: URI): Promise<boolean> {
		this.checkedUris.push(file.toString());
		return this.ignoredUris.has(file);
	}
}

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

	function createMovePatch(destination: URI): IApplyPatchToolParams {
		return {
			explanation: 'Condense the offSide language array and move the file.',
			input: [
				'*** Begin Patch',
				`*** Update File: ${path}`,
				`*** Move to: ${destination.fsPath}`,
				'@@',
				'-\tconst offSide = [',
				'-\t\t\'clojure\',',
				'-\t\t\'coffeescript\',',
				'-\t\t\'fsharp\',',
				'-\t\t\'latex\',',
				'-\t\t\'markdown\',',
				'-\t\t\'pug\',',
				'-\t\t\'python\',',
				'-\t\t\'sql\',',
				'-\t\t\'yaml\',',
				'-\t].includes(languageId.toLowerCase());',
				'+\tconst offSide = [\'clojure\',\'coffeescript\',\'fsharp\',\'latex\',\'markdown\',\'pug\',\'python\',\'sql\',\'yaml\'].includes(languageId.toLowerCase());',
				'*** End Patch',
			].join('\n'),
		};
	}

	function createRecordingStream(editedUris: string[]): ChatResponseStreamImpl {
		return new ChatResponseStreamImpl(part => {
			if (part instanceof ChatResponseTextEditPart && part.edits.length > 0) {
				editedUris.push(part.uri.toString());
			}
		}, () => { }, () => { }, undefined, undefined, () => Promise.resolve(undefined));
	}

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

	it('rejects a content-excluded move destination before emitting edits', async () => {
		const services = createExtensionUnitTestingServices();
		const destination = URI.file(join(__dirname, 'fixtures/ignored.ts'));
		const ignoreService = new TestIgnoreService(new ResourceSet([destination]));
		services.define(IIgnoreService, ignoreService);

		const content = String(readFileSync(path));
		const testDoc = createTextDocumentData(fileTsUri, content, 'ts').document;
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService, [[fileTsUri], [testDoc]]
		));
		const localAccessor = services.createTestingAccessor();
		const tool = localAccessor.get(IInstantiationService).createInstance(ApplyPatchTool);
		const editedUris: string[] = [];
		const input = await tool.resolveInput(createMovePatch(destination), {
			history: [],
			stream: createRecordingStream(editedUris),
			query: 'change and move the file',
			chatVariables: new ChatVariablesCollection([]),
		});

		const result = await tool.invoke({ input, toolInvocationToken: undefined }, CancellationToken.None);

		expect({
			hasError: result instanceof ExtendedLanguageModelToolResult ? result.hasError : undefined,
			editedUris,
			checkedUris: ignoreService.checkedUris,
		}).toEqual({
			hasError: true,
			editedUris: [],
			checkedUris: [fileTsUri.toString(), destination.toString()],
		});
	});

	it('rejects a move destination outside allowedEditUris before emitting edits', async () => {
		const destination = URI.file(join(__dirname, 'fixtures/disallowed.ts'));
		const tool = accessor.get(IInstantiationService).createInstance(ApplyPatchTool);
		const editedUris: string[] = [];
		const input = await tool.resolveInput(createMovePatch(destination), {
			history: [],
			stream: createRecordingStream(editedUris),
			query: 'change and move the file',
			chatVariables: new ChatVariablesCollection([]),
			allowedEditUris: new ResourceSet([fileTsUri]),
		});

		const result = await tool.invoke({ input, toolInvocationToken: undefined }, CancellationToken.None);

		expect({
			hasError: result instanceof ExtendedLanguageModelToolResult ? result.hasError : undefined,
			editedUris,
		}).toEqual({
			hasError: true,
			editedUris: [],
		});
	});

	it('applies a move when the source and destination are allowed', async () => {
		const destination = URI.file(join(__dirname, 'fixtures/allowed.ts'));
		const tool = accessor.get(IInstantiationService).createInstance(ApplyPatchTool);
		const editedUris: string[] = [];
		const input = await tool.resolveInput(createMovePatch(destination), {
			history: [],
			stream: createRecordingStream(editedUris),
			query: 'change and move the file',
			chatVariables: new ChatVariablesCollection([]),
			allowedEditUris: new ResourceSet([fileTsUri, destination]),
		});

		const result = await tool.invoke({ input, toolInvocationToken: undefined }, CancellationToken.None);

		expect({
			hasError: result instanceof ExtendedLanguageModelToolResult ? result.hasError : undefined,
			editedUris,
		}).toEqual({
			hasError: false,
			editedUris: [destination.toString()],
		});
	});

	suite('healedPatchAffectsSameFiles', () => {
		const makePatch = (lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');

		it('accepts a heal touching the same single file', () => {
			const original = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y']);
			const healed = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y2']);
			expect(healedPatchAffectsSameFiles(original, healed)).toBe(true);
		});

		it('accepts a heal touching the same set of multiple files in any order', () => {
			const original = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y', '*** Delete File: /b.ts']);
			const healed = makePatch(['*** Delete File: /b.ts', '*** Update File: /a.ts', '@@', '-x', '+z']);
			expect(healedPatchAffectsSameFiles(original, healed)).toBe(true);
		});

		it('rejects a heal that adds a new file', () => {
			const original = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y']);
			const healed = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y', '*** Add File: /b.ts', '+hello']);
			expect(healedPatchAffectsSameFiles(original, healed)).toBe(false);
		});

		it('rejects a heal that drops a file', () => {
			const original = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y', '*** Delete File: /b.ts']);
			const healed = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y']);
			expect(healedPatchAffectsSameFiles(original, healed)).toBe(false);
		});

		it('rejects a heal that targets a different file', () => {
			const original = makePatch(['*** Update File: /a.ts', '@@', '-x', '+y']);
			const healed = makePatch(['*** Update File: /c.ts', '@@', '-x', '+y']);
			expect(healedPatchAffectsSameFiles(original, healed)).toBe(false);
		});
	});
});
