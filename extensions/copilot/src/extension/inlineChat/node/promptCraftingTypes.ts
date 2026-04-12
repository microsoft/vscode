/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEditSurvivalTrackingSession } from '../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { ILanguage } from '../../../util/common/languages';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { ChatResponseMarkdownPart, ChatResponseNotebookEditPart, ChatResponseTextEditPart } from '../../../vscodeTypes';
import { ChatTelemetry } from '../../prompt/node/chatParticipantTelemetry';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IIntent } from '../../prompt/node/intents';
import { CodeContextRegion } from './codeContextRegion';

//#region interpreting copilot response

/**
 * Determines the interaction outcome based on what passes through the stream.
 */
export class InteractionOutcomeComputer {

	private _annotations: OutcomeAnnotation[] = [];
	private _seenMarkdown = false;
	private _seenEdits = new ResourceSet();
	private _seenNoOpEdits = false;
	public store: ISessionTurnStorage | undefined = undefined;

	private get _interactionOutcomeKind(): InteractionOutcomeKind {
		if (this._seenEdits.size > 0) {
			// edits have been sent to the response stream
			return (
				this._seenEdits.size === 1 && this._currentDocument && this._seenEdits.has(this._currentDocument)
					? 'inlineEdit'
					: 'workspaceEdit'
			);
		}
		if (this._seenMarkdown) {
			return 'conversational';
		}
		if (this._seenNoOpEdits) {
			return 'noopEdit';
		}
		return 'none';
	}

	public get interactionOutcome(): InteractionOutcome {
		return new InteractionOutcome(this._interactionOutcomeKind, this._annotations);
	}

	constructor(private readonly _currentDocument: vscode.Uri | undefined) {
	}

	public spyOnStream(outStream: vscode.ChatResponseStream): vscode.ChatResponseStream {
		return ChatResponseStreamImpl.spy(outStream, (part) => {
			if (part instanceof ChatResponseMarkdownPart) {
				this._markEmittedMarkdown(part.value);
			}
			if (part instanceof ChatResponseTextEditPart) {
				this._markEmittedEdits(part.uri, part.edits);
			}
			if (part instanceof ChatResponseNotebookEditPart) {
				this._markEmittedNotebookEdits(part.uri, part.edits);
			}
		});
	}

	private _markEmittedMarkdown(str: vscode.MarkdownString) {
		this._seenMarkdown = true;
	}

	private _markEmittedEdits(uri: vscode.Uri, edits: vscode.TextEdit[]) {
		this._seenEdits.add(uri);
	}

	private _markEmittedNotebookEdits(uri: vscode.Uri, edits: vscode.NotebookEdit[]) {
		this._seenEdits.add(uri);
	}

	public addAnnotations(annotations: OutcomeAnnotation[] = []): void {
		this._seenNoOpEdits = this._seenNoOpEdits || annotations.some(annotation => annotation.label === OutcomeAnnotationLabel.NOOP_EDITS);
		this._annotations = this._annotations.concat(annotations);
	}

	storeInInlineSession(store: ISessionTurnStorage): void {
		this.store = store;
	}
}

export class InteractionOutcome {
	constructor(
		public readonly kind: InteractionOutcomeKind,
		public readonly annotations: OutcomeAnnotation[]
	) { }
}

export type InteractionOutcomeKind = 'noopEdit' | 'inlineEdit' | 'workspaceEdit' | 'none' | 'conversational';

export interface OutcomeAnnotation {
	label: string;
	message: string;
	severity: 'info' | 'warning' | 'error';
}

export enum OutcomeAnnotationLabel {
	NO_PATCH = 'no patch',
	INVALID_PATCH = 'invalid patch',
	OTHER_FILE = 'other file',
	MULTI_FILE = 'multi file',
	INVALID_EDIT_OVERLAP = 'overlapping edit',
	INVALID_PROJECTION = 'invalid projection',
	INVALID_PATCH_LAZY = 'patch lazy',
	INVALID_PATCH_COMMENT = 'patch no comment',
	INVALID_PATCH_SMALL = 'patch small',
	INVALID_PATCH_NOOP = 'patch no op',
	SUMMARIZE_CONFLICT = 'summarize conflict',
	NOOP_EDITS = 'noop edits'
}

/**
 * Some data that can be saved in the session across turns.
 */
export interface ISessionTurnStorage {
	lastDocumentContent: string;
	lastWholeRange: vscode.Range;
}

//#endregion

export interface PromptQuery extends IDocumentContext {
	query: string;
	intent?: IIntent;
}

export interface ICodeContextInfo {
	language: ILanguage;
	above: CodeContextRegion;
	range: CodeContextRegion;
	below: CodeContextRegion;
}

export class CopilotInteractiveEditorResponse {
	constructor(
		readonly store: ISessionTurnStorage | undefined,
		readonly promptQuery: PromptQuery,
		readonly messageId: string,
		readonly telemetry: ChatTelemetry | undefined,
		readonly editSurvivalTracker: IEditSurvivalTrackingSession
	) { }
}
