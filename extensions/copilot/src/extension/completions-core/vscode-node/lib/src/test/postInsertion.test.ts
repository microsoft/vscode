/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Sinon from 'sinon';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsCitationManager, IPDocumentCitation } from '../citationManager';
import { CopilotCompletion } from '../ghostText/copilotCompletion';
import { ResultType } from '../ghostText/resultType';
import { postInsertionTasks } from '../postInsertion';
import { TelemetryWithExp } from '../telemetry';
import { IPosition, ITextDocument } from '../textDocument';
import { ICompletionsTextDocumentManagerService } from '../textDocumentManager';
import { ICompletionsPromiseQueueService } from '../util/promiseQueue';
import { createLibTestingContext } from './context';
import { fakeCodeReference } from './fetcher';
import { TestTextDocumentManager } from './textDocument';

suite('postInsertionTasks', function () {
	let accessor: ServicesAccessor;
	let handleIPCodeCitation: Sinon.SinonSpy<[citation: IPDocumentCitation], Promise<void>>;
	let docMgr: TestTextDocumentManager;
	let doc: ITextDocument;
	const uri = 'file:///hello.js';
	const pos: IPosition = { line: 1, character: 0 };
	const completionText = 'console.log("Hello, world!")';
	let completion: CopilotCompletion;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		const citationManager = accessor.get(ICompletionsCitationManager);
		handleIPCodeCitation = Sinon.spy(citationManager, 'handleIPCodeCitation');
		docMgr = accessor.get(ICompletionsTextDocumentManagerService) as TestTextDocumentManager;
		doc = docMgr.setTextDocument(uri, 'javascript', 'function main() {\n\n\n}');
		completion = {
			uuid: '1234-5678-9abc',
			insertText: completionText,
			range: { start: pos, end: pos },
			uri: doc.uri,
			telemetry: TelemetryWithExp.createEmptyConfigForTesting(),
			displayText: 'console.log("Hello, world!")',
			position: pos,
			offset: doc.offsetAt(pos),
			index: 0,
			resultType: ResultType.Network,
			clientCompletionId: '1234-5678-9abc',
		};
	});

	test('invokes CitationManager when code references are present in the completion', async function () {
		completion.copilotAnnotations = fakeCodeReference(0, completionText.length);
		const citations = (
			completion.copilotAnnotations.ip_code_citations[0].details as { citations: { license: string; url: string }[] }
		).citations;

		docMgr.updateTextDocument(doc.uri, `function main() {\n${completionText}\n\n}`);
		postInsertionTasks(
			accessor,
			'ghostText',
			completionText,
			completion.offset,
			doc.uri,
			completion.telemetry,
			{ compType: 'full', acceptedLength: completionText.length, acceptedLines: 0 },
			completion.copilotAnnotations
		);
		const promiseQueue = accessor.get(ICompletionsPromiseQueueService);
		await promiseQueue.flush();

		Sinon.assert.calledOnceWithExactly(handleIPCodeCitation, {
			inDocumentUri: doc.uri,
			offsetStart: completion.offset,
			offsetEnd: completion.offset + completionText.length,
			version: doc.version + 1,
			location: { start: pos, end: { line: pos.line, character: completionText.length } },
			matchingText: completionText,
			details: citations,
		});
	});

	test('adjusts code reference offsets for partial acceptance', async function () {
		completion.copilotAnnotations = fakeCodeReference(0, completionText.length);
		const citations = (
			completion.copilotAnnotations.ip_code_citations[0].details as { citations: { license: string; url: string }[] }
		).citations;
		const partial = completionText.slice(0, 11);

		docMgr.updateTextDocument(doc.uri, `function main() {\n${partial}\n\n}`);
		postInsertionTasks(
			accessor,
			'ghostText',
			completionText,
			completion.offset,
			doc.uri,
			completion.telemetry,
			{ compType: 'partial', acceptedLength: partial.length, acceptedLines: 0 },
			completion.copilotAnnotations
		);
		const promiseQueue = accessor.get(ICompletionsPromiseQueueService);
		await promiseQueue.flush();

		Sinon.assert.calledOnceWithExactly(handleIPCodeCitation, {
			inDocumentUri: doc.uri,
			offsetStart: completion.offset,
			offsetEnd: completion.offset + partial.length,
			version: doc.version + 1,
			location: { start: pos, end: { line: pos.line, character: partial.length } },
			matchingText: partial,
			details: citations,
		});
	});

	test('does not invoke CitationManager when partially accepted completion excludes matched code', async function () {
		completion.copilotAnnotations = fakeCodeReference(12, 14); // "Hello, world!"
		const partial = completionText.slice(0, 11);

		docMgr.updateTextDocument(doc.uri, `function main() {\n${partial}\n\n}`);
		postInsertionTasks(
			accessor,
			'ghostText',
			completionText,
			completion.offset,
			doc.uri,
			completion.telemetry,
			{ compType: 'partial', acceptedLength: partial.length, acceptedLines: 0 },
			completion.copilotAnnotations
		);
		const promiseQueue = accessor.get(ICompletionsPromiseQueueService);
		await promiseQueue.flush();

		Sinon.assert.notCalled(handleIPCodeCitation);
	});

	test('adjusts code reference range when additional document edits have been made since completion insertion', async function () {
		completion.copilotAnnotations = fakeCodeReference(0, completionText.length);
		const citations = (
			completion.copilotAnnotations.ip_code_citations[0].details as { citations: { license: string; url: string }[] }
		).citations;

		// when we'd like the editor to notify us of acceptance:
		// docMgr.updateTextDocument(doc.uri, `function main() {\n${completionText}\n\n}`);
		// when it might:
		docMgr.updateTextDocument(doc.uri, `function main() {\n    ${completionText};\n\n}`);
		postInsertionTasks(
			accessor,
			'ghostText',
			completionText,
			completion.offset,
			doc.uri,
			completion.telemetry,
			{ compType: 'full', acceptedLength: completionText.length, acceptedLines: 3 },
			completion.copilotAnnotations
		);
		const promiseQueue = accessor.get(ICompletionsPromiseQueueService);
		await promiseQueue.flush();

		Sinon.assert.calledOnceWithExactly(handleIPCodeCitation, {
			inDocumentUri: doc.uri,
			offsetStart: completion.offset + 4,
			offsetEnd: completion.offset + 4 + completionText.length,
			version: doc.version + 1,
			location: {
				start: { line: pos.line, character: 4 },
				end: { line: pos.line, character: 4 + completionText.length },
			},
			matchingText: completionText,
			details: citations,
		});
	});
});
