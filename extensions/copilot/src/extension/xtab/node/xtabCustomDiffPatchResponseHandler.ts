/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { NoNextEditReason, StreamedEdit } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILogger } from '../../../platform/log/common/logService';
import { ErrorUtils } from '../../../util/common/errors';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { toUniquePath } from '../common/promptCraftingUtils';
import { ResponseTags } from '../common/tags';
import { CurrentDocument } from '../common/xtabCurrentDocument';


class Patch {
	public removedLines: string[] = [];
	public addedLines: string[] = [];

	private constructor(
		/**
		 * Expected to be file path relative to workspace root.
		 */
		public readonly filePath: string,
		public readonly lineNumZeroBased: number,
	) { }

	public static ofLine(line: string): Patch | null {
		const match = line.match(/^(.+):(\d+)$/);
		if (!match) {
			return null;
		}
		const [, filename, lineNumber] = match;
		return new Patch(filename, parseInt(lineNumber, 10));
	}

	addLine(line: string) {
		const contentLine = line.slice(1);
		if (line.startsWith('-')) {
			this.removedLines.push(contentLine);
			return true;
		} else if (line.startsWith('+')) {
			this.addedLines.push(contentLine);
			return true;
		} else {
			return false;
		}
	}

	public toString(): string {
		return [
			`${this.filePath}:${this.lineNumZeroBased}`,
			...this.removedLines.map(l => `-${l}`),
			...this.addedLines.map(l => `+${l}`),
		].join('\n');
	}
}


export class XtabCustomDiffPatchResponseHandler {

	public static async *handleResponse(
		linesStream: AsyncIterable<string>,
		currentDocument: CurrentDocument,
		activeDocumentId: DocumentId,
		workspaceRoot: URI | undefined,
		window: OffsetRange | undefined,
		parentTracer: ILogger,
		getFetchFailure?: () => NoNextEditReason | undefined,
	): AsyncGenerator<StreamedEdit, NoNextEditReason, void> {
		const tracer = parentTracer.createSubLogger(['XtabCustomDiffPatchResponseHandler', 'handleResponse']);
		const activeDocRelativePath = toUniquePath(activeDocumentId, workspaceRoot?.path);
		try {
			for await (const edit of XtabCustomDiffPatchResponseHandler.extractEdits(linesStream)) {
				const fetchFailure = getFetchFailure?.();
				if (fetchFailure) {
					return fetchFailure;
				}
				const targetDocument = edit.filePath === activeDocRelativePath
					? activeDocumentId
					: XtabCustomDiffPatchResponseHandler.resolveTargetDocument(edit.filePath, workspaceRoot);
				if (!targetDocument) {
					tracer.error(`Could not resolve target document for edit: ${edit.toString()}`);
					continue;
				}
				yield {
					edit: XtabCustomDiffPatchResponseHandler.resolveEdit(edit),
					isFromCursorJump: false,
					targetDocument,
					window,
				} satisfies StreamedEdit;
			}
		} catch (e: unknown) {
			const err = ErrorUtils.fromUnknown(e);
			return new NoNextEditReason.Unexpected(err);
		}

		return new NoNextEditReason.NoSuggestions(currentDocument.content, window, undefined);
	}

	private static resolveEdit(patch: Patch): LineReplacement {
		return new LineReplacement(new LineRange(patch.lineNumZeroBased + 1, patch.lineNumZeroBased + 1 + patch.removedLines.length), patch.addedLines);
	}

	private static resolveTargetDocument(filePath: string, workspaceRoot: URI | undefined): DocumentId | undefined {
		if (isAbsolute(filePath)) {
			return DocumentId.create(URI.file(filePath).toString());
		}
		if (workspaceRoot) {
			return DocumentId.create(URI.joinPath(workspaceRoot, filePath).toString());
		}
		// Relative path with no workspace root — cannot resolve to a valid URI
		return undefined;
	}

	public static async *extractEdits(linesStream: AsyncIterable<string>): AsyncGenerator<Patch> {
		let currentPatch: Patch | null = null;
		for await (const line of linesStream) {
			// if no current patch, try to parse a new one
			if (line.trim() === ResponseTags.NO_EDIT) {
				break;
			}
			if (currentPatch === null) {
				currentPatch = Patch.ofLine(line);
				continue;
			}
			// try to add line to current patch
			if (currentPatch.addLine(line)) {
				continue;
			} else { // line does not belong to current patch, yield current and start new
				if (currentPatch) {
					yield currentPatch;
				}
				currentPatch = Patch.ofLine(line);
			}
		}
		if (currentPatch) {
			yield currentPatch;
		}
	}
}
