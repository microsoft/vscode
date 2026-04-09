/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { Chunk, ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { newLineEnded } from '../../../../prompt/src/languageMarker';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	CompletionRequestData,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';
import { FullRecentEditsProvider, ICompletionsRecentEditsProviderService } from '../recentEdits/recentEditsProvider';
import { RecentEdit } from '../recentEdits/recentEditsReducer';

export function editIsTooCloseToCursor(
	edit: RecentEdit,
	filterByCursorLine: boolean = false,
	cursorLine: number | undefined = undefined,
	activeDocDistanceLimitFromCursor: number | undefined
): boolean {
	if (filterByCursorLine) {
		if (cursorLine === undefined || activeDocDistanceLimitFromCursor === undefined) {
			throw new Error(
				'cursorLine and activeDocDistanceLimitFromCursor are required when filterByCursorLine is true'
			);
		}
	}

	const startLineNumber = edit.startLine - 1;
	const endLineNumber = edit.endLine - 1;

	if (
		filterByCursorLine &&
		(Math.abs(startLineNumber - cursorLine!) <= activeDocDistanceLimitFromCursor! ||
			Math.abs(endLineNumber - cursorLine!) <= activeDocDistanceLimitFromCursor!)
	) {
		// skip over a diff that's too close to the cursor
		// this isn't cached since the cursor moves
		return true;
	}
	return false;
}

type RecentEditsProps = {
	tdms: ICompletionsTextDocumentManagerService;
	recentEditsProvider: ICompletionsRecentEditsProviderService;
} & PromptElementProps;

/**
 * Render the most recent edits in the prompt.
 * @param props
 * @param context
 * @returns a <Text> element containing recent edit summaries, or undefined if there are no recent edits
 */
export const RecentEdits = (props: RecentEditsProps, context: ComponentContext) => {
	const [prompt, setPrompt] = context.useState<string | undefined>();

	context.useData(isCompletionRequestData, async (request: CompletionRequestData) => {
		if (!request.document) { return; }

		const recentEditProvider = props.recentEditsProvider;

		if (recentEditProvider.isEnabled()) {
			recentEditProvider.start();
		} else {
			return;
		}

		const recentEditsConfig = (recentEditProvider as FullRecentEditsProvider).config;
		const recentEdits = recentEditProvider.getRecentEdits();

		const filesIncluded = new Set<string>();
		const tdm = props.tdms;
		const editSummaries: string[] = [];

		// Walk backwards through the recent edits (most recent first) until we hit the max files or max edits, whichever comes first
		for (let i = recentEdits.length - 1; i >= 0; i--) {
			// if we've hit the max edits, stop
			if (editSummaries.length >= recentEditsConfig.maxEdits) { break; }

			const edit = recentEdits[i];

			// If the file is excluded, skip it
			if (!(await tdm.getTextDocument({ uri: edit.file }))) { continue; }

			// If adding an edit from this file would exceed the max files, skip it
			const isNewFile = !filesIncluded.has(edit.file);
			const projectedFileCount = filesIncluded.size + (isNewFile ? 1 : 0);
			if (projectedFileCount > recentEditsConfig.maxFiles) { break; }

			const filterByCursorLine = edit.file === request.document?.uri;
			const activeDocCursorLine = filterByCursorLine ? request.position.line : undefined;

			// Check if the edit is too close to the cursor line, if applicable, in which case we skip it
			const editTooClose = editIsTooCloseToCursor(
				edit,
				filterByCursorLine,
				activeDocCursorLine,
				recentEditsConfig.activeDocDistanceLimitFromCursor
			);
			if (editTooClose) {
				continue;
			}

			const summarizedEdit = recentEditProvider.getEditSummary(edit);
			if (summarizedEdit) {
				filesIncluded.add(edit.file);
				const relativePathOrUri = tdm.getRelativePath({ uri: edit.file });
				editSummaries.unshift(newLineEnded(`File: ${relativePathOrUri}`) + newLineEnded(summarizedEdit));
			}
		}

		if (editSummaries.length === 0) {
			setPrompt(undefined);
			return;
		}

		const newPrompt =
			newLineEnded('These are recently edited files. Do not suggest code that has been deleted.') +
			editSummaries.join('') +
			newLineEnded('End of recent edits');

		setPrompt(newPrompt);
	});

	return prompt ? (
		<Chunk>
			<Text>{prompt}</Text>
		</Chunk>
	) : undefined;
};
