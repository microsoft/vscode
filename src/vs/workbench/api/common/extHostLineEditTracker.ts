/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostContext, MainContext, MainThreadLineEditTrackerShape, ILineEditSourcesChangeData } from './extHost.protocol.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import * as extHostTypes from './extHostTypes.js';
import * as vscode from 'vscode';

export interface IExtHostLineEditTracker {
	readonly _serviceBrand: undefined;
}

export class ExtHostLineEditTracker extends Disposable implements IExtHostLineEditTracker {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeLineEditSources = this._register(new Emitter<extHostTypes.LineEditSourcesChangeEvent>());
	public readonly onDidChangeLineEditSources: Event<extHostTypes.LineEditSourcesChangeEvent> = this._onDidChangeLineEditSources.event;

	private readonly _proxy: MainThreadLineEditTrackerShape;

	constructor(
		rpcService: IExtHostRpcService,
		private readonly _documentsAndEditors: IExtHostDocumentsAndEditors
	) {
		super();
		this._proxy = rpcService.getProxy(MainContext.MainThreadLineEditTracker);

		// Register for RPC calls from main thread
		rpcService.set(ExtHostContext.ExtHostLineEditTracker, this);
	}

	/**
	 * Get the edit source for a specific line in a document
	 */
	public async getLineEditSource(document: vscode.TextDocument, lineNumber: number): Promise<extHostTypes.LineEditSource> {
		const uri = document.uri;
		return await this._proxy.$getLineEditSource(uri, lineNumber);
	}

	/**
	 * Get edit sources for all lines that have been tracked in a document
	 */
	public async getAllLineEditSources(document: vscode.TextDocument): Promise<{ [lineNumber: number]: extHostTypes.LineEditSource }> {
		const uri = document.uri;
		const sources = await this._proxy.$getAllLineEditSources(uri);
		return sources;
	}

	/**
	 * Get edit sources for a specific document
	 */
	public async getLineEditSourceForDocument(document: vscode.TextDocument, lineNumber: number): Promise<extHostTypes.LineEditSource> {
		return await this._proxy.$getLineEditSource(document.uri, lineNumber);
	}

	/**
	 * Get all edit sources for a specific document
	 */
	public async getAllLineEditSourcesForDocument(document: vscode.TextDocument): Promise<Map<number, extHostTypes.LineEditSource>> {
		const sources = await this._proxy.$getAllLineEditSources(document.uri);
		return new Map(Object.entries(sources).map(([lineStr, source]) => [parseInt(lineStr, 10), source]));
	}

	/**
	 * Called by main thread when line edit sources change
	 */
	public $onDidChangeLineEditSources(data: ILineEditSourcesChangeData): void {
		const editor = this._documentsAndEditors.getEditor(data.editorId);
		if (!editor) {
			return;
		}

		const changes = new Map<number, extHostTypes.LineEditSource>(
			Object.entries(data.changes).map(([lineStr, source]) => [parseInt(lineStr, 10), source as extHostTypes.LineEditSource])
		);

		const event: extHostTypes.LineEditSourcesChangeEvent = {
			editor: editor.value,
			changes: Object.fromEntries(changes)
		};

		this._onDidChangeLineEditSources.fire(event);
	}
}
