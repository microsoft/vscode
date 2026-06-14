/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Raw } from '@vscode/prompt-tsx';
import { IAlternativeAction, NextEditTelemetryStatus } from '../../../src/extension/inlineEdits/node/nextEditProviderTelemetry';
import { LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { ISerializedEdit } from '../logRecordingTypes';

export type IStringReplacement = [start: number, endEx: number, text: string];

export type IData = {
	prompt: Raw.ChatMessage[];
	response: string;
	altAction: IAlternativeAction;
	postProcessingOutcome: {
		suggestedEdit: string; // example: "[978, 1021) -> \"foo\"";
		isInlineCompletion: boolean;
	};
	suggestionStatus: NextEditTelemetryStatus;
};

export namespace NextUserEdit {
	export type FileEdit = {
		/** Document id from the recording log (the `documentEncountered` id). */
		id: number;
		relativePath: string;
		edit: ISerializedEdit;
	};

	export type t = {
		edit: ISerializedEdit;
		relativePath: string;
		originalOpIdx: number;
		/**
		 * Per-file composed edits for every file touched after the request
		 * (including the current/anchor file), in first-touch order. Enables
		 * cross-file next-edit labels. The scalar `edit`/`relativePath` above
		 * remain the current (anchor) file for backwards compatibility.
		 */
		fileEdits: FileEdit[];
	};
}

export namespace Recording {
	export type t = {
		log: LogEntry[];
		nextUserEdit: NextUserEdit.t;
	};
}

export namespace SuggestedEdit {
	export type t = {
		documentUri: string;
		edit: ISerializedEdit;
		scoreCategory: 'nextEdit';
		score: number;
	};
}

export namespace Scoring {
	export type t = {
		'$web-editor.format-json': true;
		'$web-editor.default-url': 'https://microsoft.github.io/vscode-workbench-recorder-viewer/?editRating';
		edits: SuggestedEdit.t[];
		scoringContext: {
			kind: 'recording';
			recording: Recording.t;
		};
	};

	export function create(recording: Recording.t, edits: SuggestedEdit.t[]): Scoring.t {
		return {
			'$web-editor.format-json': true,
			'$web-editor.default-url': 'https://microsoft.github.io/vscode-workbench-recorder-viewer/?editRating',
			edits,
			scoringContext: {
				kind: 'recording',
				recording
			}
		};
	}
}

