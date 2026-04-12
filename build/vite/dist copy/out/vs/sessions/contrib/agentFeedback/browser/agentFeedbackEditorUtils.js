/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
/**
 * Find the session that contains the given resource by checking editing sessions,
 * sessions providers, and agent sessions.
 */
export function getSessionForResource(resourceUri, chatEditingService, sessionsManagementService) {
    for (const editingSession of chatEditingService.editingSessionsObs.get()) {
        if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
            return editingSession.chatSessionResource;
        }
    }
    for (const session of sessionsManagementService.getSessions()) {
        const changes = session.changes.get();
        if (changes.some(change => changeMatchesResource(change, resourceUri))) {
            return session.resource;
        }
    }
    return undefined;
}
export function changeMatchesResource(change, resourceUri) {
    if (isIChatSessionFileChange2(change)) {
        return change.uri.fsPath === resourceUri.fsPath
            || change.modifiedUri?.fsPath === resourceUri.fsPath
            || change.originalUri?.fsPath === resourceUri.fsPath;
    }
    return change.modifiedUri.fsPath === resourceUri.fsPath
        || change.originalUri?.fsPath === resourceUri.fsPath;
}
export function getSessionChangeForResource(sessionResource, resourceUri, sessionsManagementService) {
    if (!sessionResource) {
        return undefined;
    }
    const sessionData = sessionsManagementService.getSession(sessionResource);
    if (sessionData) {
        const changes = sessionData.changes.get();
        return changes.find(change => changeMatchesResource(change, resourceUri));
    }
    return undefined;
}
export function createAgentFeedbackContext(editor, codeEditorService, resourceUri, range) {
    const codeSelection = getCodeSelection(editor, codeEditorService, resourceUri, range);
    const diffHunks = getDiffHunks(editor, codeEditorService, resourceUri, range);
    return { codeSelection, diffHunks };
}
function getCodeSelection(editor, codeEditorService, resourceUri, range) {
    const model = getModelForResource(editor, codeEditorService, resourceUri);
    if (!model) {
        return undefined;
    }
    const selection = model.getValueInRange(range);
    return selection.length > 0 ? selection : undefined;
}
function getDiffHunks(editor, codeEditorService, resourceUri, range) {
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
        const changeTouchesSelection = (change) => rangeTouchesChange(range, selectionIsInOriginal ? change.original : change.modified);
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
function getContainingDiffEditor(editor, codeEditorService) {
    return codeEditorService.listDiffEditors().find(diffEditor => diffEditor.getModifiedEditor() === editor || diffEditor.getOriginalEditor() === editor);
}
function getModelForResource(editor, codeEditorService, resourceUri) {
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
function groupChanges(changes) {
    const contextSize = 3;
    const groups = [];
    let currentGroup = [];
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
        }
        else {
            groups.push(currentGroup);
            currentGroup = [change];
        }
    }
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    return groups;
}
function rangeTouchesChange(range, lineRange) {
    const isEmptySelection = range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
    if (isEmptySelection) {
        return !lineRange.isEmpty && lineRange.contains(range.startLineNumber);
    }
    const selectionStart = range.startLineNumber;
    const selectionEndExclusive = range.endLineNumber + 1;
    return selectionStart <= lineRange.startLineNumber && lineRange.endLineNumberExclusive <= selectionEndExclusive;
}
function renderHunkGroup(group, originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline) {
    const contextSize = 3;
    const firstChange = group[0];
    const lastChange = group[group.length - 1];
    const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
    const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
    const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);
    const hunkLines = [];
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
    }
    else if (!modifiedEndsWithNewline && lastModifiedLineIndex >= 0) {
        result.splice(lastModifiedLineIndex + 2, 0, '\\ No newline at end of file');
    }
    return result.join('\n');
}
export function getActiveResourceCandidates(input) {
    const result = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvclV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja0VkaXRvclV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFLL0QsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFbEcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDdEgsT0FBTyxFQUFtRCx5QkFBeUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRzlKOzs7R0FHRztBQUNILE1BQU0sVUFBVSxxQkFBcUIsQ0FDcEMsV0FBZ0IsRUFDaEIsa0JBQXVDLEVBQ3ZDLHlCQUFxRDtJQUVyRCxLQUFLLE1BQU0sY0FBYyxJQUFJLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDMUUsSUFBSSw2QkFBNkIsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDOUUsT0FBTyxjQUFjLENBQUMsbUJBQW1CLENBQUM7UUFDM0MsQ0FBQztJQUNGLENBQUM7SUFDRCxLQUFLLE1BQU0sT0FBTyxJQUFJLHlCQUF5QixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUM7UUFDL0QsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN0QyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxx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