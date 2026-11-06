/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EXISTING_CODE_MARKER } from '../../src/extension/prompts/node/panel/codeBlockFormattingRules';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { IFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { splitLines } from '../../src/util/vs/base/common/strings';
import { getDiagnostics } from './diagnosticProviders';
import { DiagnosticsProvider, ITestDiagnostic } from './diagnosticProviders/diagnosticsProvider';
import { DiagnosticProviderId, IInlineEditOutcome, IOutcome, IWorkspaceEditOutcome, OutcomeAnnotation } from './types';

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
