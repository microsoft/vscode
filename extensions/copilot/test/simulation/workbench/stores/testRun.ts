/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as path from 'path';
import { INLINE_STATE_TAG, InterceptedRequest, ISerializedFileEdit, ISerializedNesUserEditsHistory, IWorkspaceState, IWrittenFile, NES_LOG_CONTEXT_TAG, NES_USER_EDITS_HISTORY_TAG, NEXT_EDIT_SUGGESTION_TAG, OutputAnnotation, REQUESTS_TAG } from '../../shared/sharedTypes';
import { ObservablePromise } from '../utils/utils';
import { EvaluationError } from './amlResults';
import { InitialWorkspaceState, InteractionWorkspaceState, WorkspaceState } from './simulationWorkspaceState';


export class TestRun {

	@mobx.observable
	public errorsOnlyInBefore: EvaluationError[] | undefined = undefined;

	@mobx.observable
	public errorsOnlyInAfter: any[] | undefined = undefined;

	@mobx.observable
	public stdout: string | undefined = undefined;

	@mobx.observable
	public stderr: string | undefined = undefined;

	@mobx.observable
	public pass: boolean;

	@mobx.observable
	public error: string | undefined;

	@mobx.observable
	public generatedTestCaseCount: number | undefined = undefined;

	@mobx.observable
	public generatedAssertCount: number | undefined = undefined;

	@mobx.observable
	public expectedDiff: string | undefined = undefined;

	@mobx.computed
	public get hasInlineState(): boolean {
		return this.writtenFiles.some(f => f.tag === INLINE_STATE_TAG);
	}

	@mobx.computed
	public get nextEditSuggestion(): ObservablePromise<ISerializedFileEdit | undefined> {
		return new ObservablePromise(this._getNextEditSuggestion(), undefined);
	}

	@mobx.computed
	public get nesUserEditsHistory(): ObservablePromise<ISerializedNesUserEditsHistory | undefined> {
		return new ObservablePromise(this._getNesUserEditsHistory(), undefined);
	}

	@mobx.computed
	public get nesLogContext(): ObservablePromise<string | undefined> {
		return new ObservablePromise(this._getNesLogContext(), undefined);
	}

	@mobx.computed
	public get inlineChatWorkspaceStates(): ObservablePromise<WorkspaceState[]> {
		return new ObservablePromise(this._getInlineState(), []);
	}

	@mobx.computed
	public get requests(): ObservablePromise<InterceptedRequest[]> {
		return new ObservablePromise(this._getInterceptedRequests(), []);
	}

	constructor(
		public readonly runNumber: number,
		pass: boolean, // this is mutable because it may be set later/lazily
		public readonly explicitScore: number | undefined,
		error: string | undefined,
		public readonly duration: number,
		public readonly writtenFilesBaseDir: string,
		public readonly writtenFiles: IWrittenFile[],
		public readonly averageRequestDuration: number | undefined,
		public readonly requestCount: number | undefined,
		public readonly hasCacheMiss: boolean | undefined,
		public readonly annotations: OutputAnnotation[] = [],
	) {
		this.pass = pass;
		this.error = error;
		mobx.makeObservable(this);
	}

	private _inlineStatePromise: Promise<WorkspaceState[]> | undefined;
	private async _getInlineState(): Promise<WorkspaceState[]> {
		if (!this._inlineStatePromise) {
			this._inlineStatePromise = this._doGetInlineState();
		}
		return this._inlineStatePromise;
	}

	private async _doGetInlineState(): Promise<WorkspaceState[]> {
		const contents = await this.getWrittenFileByTag(INLINE_STATE_TAG);
		if (!contents) {
			return [];
		}
		const result = JSON.parse(contents) as IWorkspaceState[];
		return result.map((el) => {
			if (el.kind === 'initial') {
				return new InitialWorkspaceState(el, this.writtenFilesBaseDir);
			}
			return new InteractionWorkspaceState(el, this.writtenFilesBaseDir);
		});
	}

	private _nextEditSuggestionPromise: Promise<ISerializedFileEdit | undefined> | undefined;
	private _getNextEditSuggestion(): Promise<ISerializedFileEdit | undefined> {
		if (!this._nextEditSuggestionPromise) {
			this._nextEditSuggestionPromise = this._doGetNextEditSuggestion();
		}
		return this._nextEditSuggestionPromise;
	}

	private async _doGetNextEditSuggestion(): Promise<ISerializedFileEdit | undefined> {
		const contents = await this.getWrittenFileByTag(NEXT_EDIT_SUGGESTION_TAG);
		if (!contents) {
			return undefined;
		}
		return JSON.parse(contents) as ISerializedFileEdit;
	}

	private _nesUserEditsHistoryPromise: Promise<ISerializedNesUserEditsHistory | undefined> | undefined = undefined;
	private _getNesUserEditsHistory(): Promise<ISerializedNesUserEditsHistory | undefined> {
		if (this._nesUserEditsHistoryPromise === undefined) {
			this._nesUserEditsHistoryPromise = this._doGetNesUserEditsHistory();
		}
		return this._nesUserEditsHistoryPromise;
	}

	private async _doGetNesUserEditsHistory(): Promise<ISerializedNesUserEditsHistory | undefined> {
		const contents = await this.getWrittenFileByTag(NES_USER_EDITS_HISTORY_TAG);
		if (!contents) {
			return undefined;
		}
		return JSON.parse(contents) as ISerializedNesUserEditsHistory;
	}

	private _nesLogContext: Promise<string | undefined> | undefined = undefined;
	private _getNesLogContext(): Promise<string | undefined> {
		if (this._nesLogContext === undefined) {
			this._nesLogContext = this._doGetNesLogContext();
		}
		return this._nesLogContext;
	}

	private async _doGetNesLogContext(): Promise<string | undefined> {
		const contents = await this.getWrittenFileByTag(NES_LOG_CONTEXT_TAG);
		if (!contents) {
			return undefined;
		}
		return JSON.parse(contents);
	}

	private _interceptedRequestsPromise: Promise<InterceptedRequest[]> | undefined;
	private async _getInterceptedRequests(): Promise<InterceptedRequest[]> {
		if (!this._interceptedRequestsPromise) {
			this._interceptedRequestsPromise = this._doGetInterceptedRequests();
		}
		return this._interceptedRequestsPromise;
	}

	private async _doGetInterceptedRequests(): Promise<InterceptedRequest[]> {
		const contents = await this.getWrittenFileByTag(REQUESTS_TAG);
		if (!contents) {
			return [];
		}
		const result = JSON.parse(contents);
		if (Array.isArray(result)) {
			return result.map(InterceptedRequest.fromJSON);
		}
		return [];
	}

	private async getWrittenFileByTag(tag: string): Promise<string | undefined> {
		const writtenFile = this.writtenFiles.find(f => f.tag === tag);
		if (!writtenFile) {
			return undefined;
		}
		const contents = await fs.promises.readFile(path.join(this.writtenFilesBaseDir, writtenFile.relativePath), 'utf8');
		return contents;
	}
}
