/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICodeEditor, IDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { agentSessionContainsResource, editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

/**
 * Find the session that contains the given resource by checking editing sessions and agent sessions.
 */
export function getSessionForResource(
	resourceUri: URI,
	chatEditingService: IChatEditingService,
	agentSessionsService: IAgentSessionsService,
): URI | undefined {
	for (const editingSession of chatEditingService.editingSessionsObs.get()) {
		if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
			return editingSession.chatSessionResource;
		}
	}

	for (const session of agentSessionsService.model.sessions) {
		if (agentSessionContainsResource(session, resourceUri)) {
			return session.resource;
		}
	}

	return undefined;
}

export type AgentFeedbackSessionChange = IChatSessionFileChange | IChatSessionFileChange2;

export interface IAgentFeedbackContext {
	readonly codeSelection?: string;
	readonly diffHunks?: string;
}

export function changeMatchesResource(change: AgentFeedbackSessionChange, resourceUri: URI): boolean {
	if (isIChatSessionFileChange2(change)) {
		return change.uri.fsPath === resourceUri.fsPath
			|| change.modifiedUri?.fsPath === resourceUri.fsPath
			|| change.originalUri?.fsPath === resourceUri.fsPath;
	}

	return change.modifiedUri.fsPath === resourceUri.fsPath
		|| change.originalUri?.fsPath === resourceUri.fsPath;
}

export function getSessionChangeForResource(
	sessionResource: URI | undefined,
	resourceUri: URI,
	agentSessionsService: IAgentSessionsService,
): AgentFeedbackSessionChange | undefined {
	if (!sessionResource) {
		return undefined;
	}

	const changes = agentSessionsService.getSession(sessionResource)?.changes;
	if (!(changes instanceof Array)) {
		return undefined;
	}

	return changes.find(change => changeMatchesResource(change, resourceUri));
}

export function createAgentFeedbackContext(
	editor: ICodeEditor,
	codeEditorService: ICodeEditorService,
	resourceUri: URI,
	range: IRange,
): IAgentFeedbackContext {
	const codeSelection = getCodeSelection(editor, codeEditorService, resourceUri, range);
	const diffHunks = getDiffHunks(editor, codeEditorService, resourceUri, range);
	return { codeSelection, diffHunks };
}

function getCodeSelection(
	editor: ICodeEditor,
	codeEditorService: ICodeEditorService,
	resourceUri: URI,
	range: IRange,
): string | undefined {
	const model = getModelForResource(editor, codeEditorService, resourceUri);
	if (!model) {
		return undefined;
	}

	const selection = model.getValueInRange(range);
	return selection.length > 0 ? selection : undefined;
}

function getDiffHunks(
	editor: ICodeEditor,
	codeEditorService: ICodeEditorService,
	resourceUri: URI,
	range: IRange,
): string | undefined {
	const diffEditor = getContainingDiffEditor(editor, codeEditorService);
	if (!diffEditor) {
		return undefined;
	}

	const originalModel = diffEditor.getOriginalEditor().getModel();
	const modifiedModel = diffEditor.getModifiedEditor().getModel();
	if (!originalModel || !modifiedModel) {
		return undefined;
	}

	const selectionIsInOriginal = isEqual(resourceUri, originalModel.uri);
	const selectionIsInModified = isEqual(resourceUri, modifiedModel.uri);
	if (!selectionIsInOriginal && !selectionIsInModified) {
		return undefined;
	}

	const diffResult = diffEditor.getDiffComputationResult();
	if (!diffResult) {
		return undefined;
	}

	const selectionIsEmpty = range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
	const relevantGroups = groupChanges(diffResult.changes2).filter(group => {
		const changeTouchesSelection = (change: DetailedLineRangeMapping) => rangeTouchesChange(range, selectionIsInOriginal ? change.original : change.modified);
		return selectionIsEmpty ? group.some(changeTouchesSelection) : group.every(changeTouchesSelection);
	});
	if (relevantGroups.length === 0) {
		return undefined;
	}

	const originalText = originalModel.getValue();
	const modifiedText = modifiedModel.getValue();
	const originalEndsWithNewline = originalText.length > 0 && originalText.endsWith('\n');
	const modifiedEndsWithNewline = modifiedText.length > 0 && modifiedText.endsWith('\n');
	const originalLines = originalText.split('\n');
	const modifiedLines = modifiedText.split('\n');

	if (originalEndsWithNewline && originalLines[originalLines.length - 1] === '') {
		originalLines.pop();
	}
	if (modifiedEndsWithNewline && modifiedLines[modifiedLines.length - 1] === '') {
		modifiedLines.pop();
	}

	return relevantGroups.map(group => renderHunkGroup(group, originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline)).join('\n');
}

function getContainingDiffEditor(editor: ICodeEditor, codeEditorService: ICodeEditorService): IDiffEditor | undefined {
	return codeEditorService.listDiffEditors().find(diffEditor =>
		diffEditor.getModifiedEditor() === editor || diffEditor.getOriginalEditor() === editor
	);
}

function getModelForResource(editor: ICodeEditor, codeEditorService: ICodeEditorService, resourceUri: URI) {
	const currentModel = editor.getModel();
	if (currentModel && isEqual(currentModel.uri, resourceUri)) {
		return currentModel;
	}

	const diffEditor = getContainingDiffEditor(editor, codeEditorService);
	const originalModel = diffEditor?.getOriginalEditor().getModel();
	if (originalModel && isEqual(originalModel.uri, resourceUri)) {
		return originalModel;
	}

	const modifiedModel = diffEditor?.getModifiedEditor().getModel();
	if (modifiedModel && isEqual(modifiedModel.uri, resourceUri)) {
		return modifiedModel;
	}

	return undefined;
}

function groupChanges(changes: readonly DetailedLineRangeMapping[]): DetailedLineRangeMapping[][] {
	const contextSize = 3;
	const groups: DetailedLineRangeMapping[][] = [];
	let currentGroup: DetailedLineRangeMapping[] = [];

	for (const change of changes) {
		if (currentGroup.length === 0) {
			currentGroup.push(change);
			continue;
		}

		const lastChange = currentGroup[currentGroup.length - 1];
		const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
		const currentContextStart = change.original.startLineNumber - contextSize;
		if (currentContextStart <= lastContextEnd + 1) {
			currentGroup.push(change);
		} else {
			groups.push(currentGroup);
			currentGroup = [change];
		}
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

function rangeTouchesChange(
	range: IRange,
	lineRange: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean; contains(lineNumber: number): boolean },
): boolean {
	const isEmptySelection = range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
	if (isEmptySelection) {
		return !lineRange.isEmpty && lineRange.contains(range.startLineNumber);
	}

	const selectionStart = range.startLineNumber;
	const selectionEndExclusive = range.endLineNumber + 1;
	return selectionStart <= lineRange.startLineNumber && lineRange.endLineNumberExclusive <= selectionEndExclusive;
}

function renderHunkGroup(
	group: readonly DetailedLineRangeMapping[],
	originalLines: string[],
	modifiedLines: string[],
	originalEndsWithNewline: boolean,
	modifiedEndsWithNewline: boolean,
): string {
	const contextSize = 3;
	const firstChange = group[0];
	const lastChange = group[group.length - 1];
	const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
	const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
	const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);

	const hunkLines: string[] = [];
	let lastOriginalLineIndex = -1;
	let lastModifiedLineIndex = -1;
	let origLineNum = hunkOrigStart;
	let origCount = 0;
	let modCount = 0;

	for (const change of group) {
		const origStart = change.original.startLineNumber;
		const origEnd = change.original.endLineNumberExclusive;
		const modStart = change.modified.startLineNumber;
		const modEnd = change.modified.endLineNumberExclusive;

		while (origLineNum < origStart) {
			const idx = hunkLines.length;
			hunkLines.push(` ${originalLines[origLineNum - 1]}`);
			if (origLineNum === originalLines.length) {
				lastOriginalLineIndex = idx;
			}
			const modLineNum = hunkModStart + modCount;
			if (modLineNum === modifiedLines.length) {
				lastModifiedLineIndex = idx;
			}
			origLineNum++;
			origCount++;
			modCount++;
		}

		for (let i = origStart; i < origEnd; i++) {
			const idx = hunkLines.length;
			hunkLines.push(`-${originalLines[i - 1]}`);
			if (i === originalLines.length) {
				lastOriginalLineIndex = idx;
			}
			origLineNum++;
			origCount++;
		}

		for (let i = modStart; i < modEnd; i++) {
			const idx = hunkLines.length;
			hunkLines.push(`+${modifiedLines[i - 1]}`);
			if (i === modifiedLines.length) {
				lastModifiedLineIndex = idx;
			}
			modCount++;
		}
	}

	while (origLineNum <= hunkOrigEnd) {
		const idx = hunkLines.length;
		hunkLines.push(` ${originalLines[origLineNum - 1]}`);
		if (origLineNum === originalLines.length) {
			lastOriginalLineIndex = idx;
		}
		const modLineNum = hunkModStart + modCount;
		if (modLineNum === modifiedLines.length) {
			lastModifiedLineIndex = idx;
		}
		origLineNum++;
		origCount++;
		modCount++;
	}

	const header = `@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`;
	const result = [header, ...hunkLines];

	if (!originalEndsWithNewline && lastOriginalLineIndex >= 0) {
		result.splice(lastOriginalLineIndex + 2, 0, '\\ No newline at end of file');
	} else if (!modifiedEndsWithNewline && lastModifiedLineIndex >= 0) {
		result.splice(lastModifiedLineIndex + 2, 0, '\\ No newline at end of file');
	}

	return result.join('\n');
}

export function getActiveResourceCandidates(input: Parameters<typeof EditorResourceAccessor.getOriginalUri>[0]): URI[] {
	const result: URI[] = [];
	const resources = EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH });
	if (!resources) {
		return result;
	}

	if (URI.isUri(resources)) {
		result.push(resources);
		return result;
	}

	if (resources.secondary) {
		result.push(resources.secondary);
	}
	if (resources.primary) {
		result.push(resources.primary);
	}

	return result;
}
