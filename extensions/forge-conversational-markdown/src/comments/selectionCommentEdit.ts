import * as vscode from 'vscode';
import { newMarkerHexId } from '../markdown/forgeMarkers';
import { findSelectionSpanInDocumentIfUnique, findSelectionSpanInRegion } from './selectionMatch';

/**
 * Locate selected text in the document within the given line range (0-based, end line exclusive)
 * and insert forge comment markers around the best match (exact or preview-aware token chain).
 */
export async function insertSelectionCommentMarkers(
	document: vscode.TextDocument,
	selectedText: string,
	startLine: number,
	endLineExclusive: number,
): Promise<{ ok: true; markerId: string } | { ok: false; reason: string }> {
	const full = document.getText();
	if (!selectedText.trim()) {
		return { ok: false, reason: 'Empty selection' };
	}

	const lineStart = Math.max(0, startLine);
	const lineEndEx = Math.max(lineStart, endLineExclusive);
	const regionStart = document.offsetAt(new vscode.Position(lineStart, 0));
	const regionEnd = lineEndEx >= document.lineCount
		? full.length
		: document.offsetAt(new vscode.Position(lineEndEx, 0));
	const region = full.slice(regionStart, regionEnd);

	const spanInRegion = findSelectionSpanInRegion(region, selectedText);
	let absStart: number;
	let absEnd: number;
	if (spanInRegion) {
		absStart = regionStart + spanInRegion.start;
		absEnd = regionStart + spanInRegion.end;
	} else {
		const unique = findSelectionSpanInDocumentIfUnique(full, selectedText);
		if (!unique) {
			return {
				ok: false,
				reason: 'Could not find this text in the Markdown source. The preview can differ from the file (headings, lists, links, emphasis). Try a shorter phrase or edit in the text editor.',
			};
		}
		absStart = unique.start;
		absEnd = unique.end;
	}
	const markerId = newMarkerHexId();
	const startTag = `<!-- forge-cmt:${markerId}:start -->`;
	const endTag = `<!-- forge-cmt:${markerId}:end -->`;
	const wrapped = `${startTag}${full.slice(absStart, absEnd)}${endTag}`;

	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, new vscode.Range(document.positionAt(absStart), document.positionAt(absEnd)), wrapped);
	const ok = await vscode.workspace.applyEdit(edit);
	if (!ok) {
		return { ok: false, reason: 'Editor rejected the change' };
	}
	return { ok: true, markerId };
}
