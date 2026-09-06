/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EXISTING_CODE_MARKER } from '../../src/extension/prompts/node/panel/codeBlockFormattingRules';
import { IAIEvaluationService } from '../../src/extension/testing/node/aiEvaluationService';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { IFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { basename } from '../../src/util/vs/base/common/resources';
import { splitLines } from '../../src/util/vs/base/common/strings';
import { URI } from '../../src/util/vs/base/common/uri';
import { getDiagnostics } from './diagnosticProviders';
import { DiagnosticsProvider, ITestDiagnostic } from './diagnosticProviders/diagnosticsProvider';
import { DiagnosticProviderId, IInlineEditOutcome, IOutcome, IWorkspaceEditOutcome, OutcomeAnnotation } from './types';

export function assertLooksLikeJSDoc(text: string): void {
	text = text.trim();
	assert(text.startsWith('/**') && text.endsWith('*/'), `expected jsdoc, but got:\n${text}`);
}

export function assertContainsAllSnippets(text: string, snippets: string[], dbgMsg: string = '') {
	for (let i = 0, len = snippets.length; i < len; ++i) {
		const snippet = snippets[i];
		assert(text.indexOf(snippet) !== -1, `${dbgMsg} (contains snippet "${snippet}")`);
	}
}

/**
 * Searches for `marker1`, and then for `marker2` after `marker1`.
 */
export function findTextBetweenMarkersFromTop(text: string, marker1: string, marker2: string): string | null {
	const index1 = text.indexOf(marker1);
	if (index1 === -1) {
		return null;
	}
	const index2 = text.indexOf(marker2, index1 + 1);
	if (index2 === -1) {
		return null;
	}
	return text.substring(index1 + marker1.length, index2);
}


/**
 * Searches for `marker2`, and then for `marker1` before `marker2`.
 */
export function findTextBetweenMarkersFromBottom(text: string, marker1: string, marker2: string) {
	const index2 = text.indexOf(marker2);
	if (index2 === -1) {
		return null;
	}
	const index1 = text.lastIndexOf(marker1, index2);
	if (index1 === -1) {
		return null;
	}
	return text.substring(index1 + marker1.length, index2);
}


/**
 * This method validates the outcome by finding if after the edit, there remain errors
 */
export async function assertNoDiagnosticsAsync(accessor: ITestingServicesAccessor, outcome: IOutcome, workspace: SimulationWorkspace, method: DiagnosticProviderId | DiagnosticsProvider) {
	assert.strictEqual(outcome.type, 'inlineEdit');
	const diagnostics = await getWorkspaceDiagnostics(accessor, workspace, method);
	if (diagnostics.length > 0) {
		for (const diagnostic of diagnostics) {
			if (diagnostic.message.indexOf('indent') !== -1) {
				outcome.annotations.push({ label: 'indentation', message: diagnostic.message, severity: 'warning' });
			}
		}
	}
	assert.deepStrictEqual(diagnostics.length, 0, JSON.stringify(diagnostics, undefined, 2));
}

/**
 * This method validates the outcome by finding if after the edit, there remain errors
 */
export async function assertNoSyntacticDiagnosticsAsync(accessor: ITestingServicesAccessor, outcome: IOutcome, workspace: SimulationWorkspace, method: DiagnosticProviderId | DiagnosticsProvider) {
	assert.strictEqual(outcome.type, 'inlineEdit');
	const diagnostics = await getWorkspaceDiagnostics(accessor, workspace, method);
	const syntacticDiagnostics = diagnostics.filter(d => d.kind === 'syntactic');

	assert.strictEqual(syntacticDiagnostics.length, 0, JSON.stringify(syntacticDiagnostics, undefined, 2));
}

/**
 * This method validates the outcome by comparing the number of errors before and after
 */
export async function assertLessDiagnosticsAsync(accessor: ITestingServicesAccessor, outcome: IOutcome, workspace: SimulationWorkspace, method: DiagnosticProviderId) {
	assert.strictEqual(outcome.type, 'inlineEdit');
	const initialDiagnostics = outcome.initialDiagnostics;
	assert.ok(initialDiagnostics);
	let numberOfDiagnosticsInitially = 0;
	for (const diagnostics of initialDiagnostics.values()) {
		numberOfDiagnosticsInitially += diagnostics.length;
	}
	const diagnostics = await getWorkspaceDiagnostics(accessor, workspace, method);
	const numberOfDiagnosticsAfter = diagnostics.length;
	assert.ok(numberOfDiagnosticsAfter < numberOfDiagnosticsInitially);
}

/**
 * Returns the diagnostics in all workspace files
 */
export async function getWorkspaceDiagnostics(accessor: ITestingServicesAccessor, workspace: SimulationWorkspace, method: DiagnosticProviderId | DiagnosticsProvider): Promise<ITestDiagnostic[]> {
	const files = workspace.documents.map(doc => ({ fileName: workspace.getFilePath(doc.document.uri), fileContents: doc.document.getText() }));
	if (typeof method === 'string') {
		return await getDiagnostics(accessor, files, method);
	} else {
		return await method.getDiagnostics(accessor, files);
	}
}

export function assertFileContent(files: IFile[] | Array<{ srcUri: string; post: string }>, fileName: string): string {
	const existing = [];
	for (const file of files) {
		// Handle new format
		if ('srcUri' in file && 'post' in file) {
			// Convert string to URI if needed
			const uri = typeof file.srcUri === 'string'
				? URI.parse(file.srcUri)
				: file.srcUri;
			const name = basename(uri);
			if (name === fileName) {
				return file.post;
			}
			existing.push(name);
		}
		// Handle old format
		else {
			const name = file.kind === 'relativeFile' ? file.fileName : basename(file.uri);
			if (name === fileName) {
				return file.fileContents;
			}
			existing.push(name);
		}
	}
	assert.fail(`Expected to find file ${fileName}. Files available: ${existing.join(', ')}`);
}

export function assertJSON(content: string): any {
	try {
		return JSON.parse(content);
	} catch (e) {
		assert.fail(`Expected JSON, but got: ${e.message}, ${content}`);
	}
}

/**
 * Helper function to get file content regardless of file format (old or new)
 */
export function getFileContent(file: IFile | { srcUri: string; post: string }): string {
	if ('srcUri' in file && 'post' in file) {
		// New format
		return file.post;
	} else if ('kind' in file && (file.kind === 'relativeFile' || file.kind === 'qualifiedFile')) {
		// Old format
		return file.fileContents;
	} else {
		throw new Error(`Unknown file format: ${JSON.stringify(file)}`);
	}
}

export function assertNoElidedCodeComments(outcome: IInlineEditOutcome | IWorkspaceEditOutcome | string): void {
	if (typeof outcome === 'string') {
		assert.ok(outcome.indexOf(EXISTING_CODE_MARKER) === -1, 'Expected no elided code comments');
	} else if (outcome.type === 'inlineEdit') {
		assertNoElidedCodeComments(outcome.fileContents);
	} else if (outcome.type === 'workspaceEdit') {
		for (const file of outcome.files) {
			// Use the helper function
			assertNoElidedCodeComments(getFileContent(file));
		}
	}
}

export async function assertCriteriaMetAsync(accessor: ITestingServicesAccessor, response: string, criteria: string): Promise<void> {
	const evaluationService = accessor.get(IAIEvaluationService);
	const result = await evaluationService.evaluate(response, criteria, CancellationToken.None);
	assert.ok(result.errorMessage === undefined, `Error: ${result.errorMessage}`);
}

export function validateConsistentIndentation(newText: string, insertSpaces: boolean, annotations: OutcomeAnnotation[]): void {
	const indentationRegex = insertSpaces ? /^[ ]*[\S$]/ : /^\t*(\S|$|( \*))/; // special handling for Doc comments that start with ` *
	const lines = splitLines(newText);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.length > 0 && !indentationRegex.test(line)) {
			const message = `Expected line ${i} to start with ${insertSpaces ? 'spaces' : 'tabs'}: ${line}`;
			annotations.push({ label: 'indentation', message, severity: 'warning' });
			//assert.fail(message);
		}
	}
}
