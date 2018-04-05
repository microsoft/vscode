/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { Position } from 'vs/platform/editor/common/editor';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import * as vscode from 'vscode';
import { WebviewEditorInput } from './webviewInput';

export const IWebviewService = createDecorator<IWebviewService>('webviewService');

export interface IWebviewService {
	_serviceBrand: any;

	createWebview(
		viewType: string,
		title: string,
		column: Position,
		options: WebviewInputOptions,
		extensionFolderPath: string,
		events: WebviewEvents
	): WebviewEditorInput;

	createRevivableWebview(
		viewType: string,
		title: string,
		state: any,
		options: WebviewInputOptions,
		extensionFolderPath: string
	): WebviewEditorInput;

	revealWebview(
		webview: WebviewEditorInput,
		column: Position | undefined
	): void;

	registerReviver(
		viewType: string,
		reviver: WebviewReviver
	): IDisposable;

	canRevive(
		input: WebviewEditorInput
	): boolean;
}

export interface WebviewReviver {
	canRevive(
		webview: WebviewEditorInput
	): boolean;

	reviveWebview(
		webview: WebviewEditorInput
	): void;
}

export interface WebviewEvents {
	onMessage?(message: any): void;
	onDidChangePosition?(newPosition: Position): void;
	onDispose?(): void;
	onDidClickLink?(link: URI, options: vscode.WebviewOptions): void;
}

export interface WebviewInputOptions extends vscode.WebviewOptions {
	tryRestoreScrollPosition?: boolean;
}

export class WebviewService implements IWebviewService {
	_serviceBrand: any;

	private readonly _revivers = new Map<string, WebviewReviver>();
	private readonly _needingRevival = new Map<string, WebviewEditorInput[]>();

	constructor(
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEditorGroupService private readonly _editorGroupService: IEditorGroupService,
	) { }

	createWebview(
		viewType: string,
		title: string,
		column: Position,
		options: vscode.WebviewOptions,
		extensionFolderPath: string,
		events: WebviewEvents
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(WebviewEditorInput, viewType, title, options, {}, events, extensionFolderPath, undefined);
		this._editorService.openEditor(webviewInput, { pinned: true }, column);
		return webviewInput;
	}

	revealWebview(
		webview: WebviewEditorInput,
		column: Position | undefined
	): void {
		if (typeof column === 'undefined') {
			column = webview.position;
		}

		if (webview.position === column) {
			this._editorService.openEditor(webview, { preserveFocus: true }, column);
		} else {
			this._editorGroupService.moveEditor(webview, webview.position, column, { preserveFocus: true });
		}
	}

	createRevivableWebview(
		viewType: string,
		title: string,
		state: any,
		options: WebviewInputOptions,
		extensionFolderPath: string
	): WebviewEditorInput {
		const webviewInput = this._instantiationService.createInstance(WebviewEditorInput, viewType, title, options, state, {}, extensionFolderPath, {
			canRevive: (webview) => {
				return true;
			},
			reviveWebview: (webview) => {
				if (!this._needingRevival.has(viewType)) {
					this._needingRevival.set(viewType, []);
				}
				this._needingRevival.get(viewType).push(webviewInput);
				this.tryRevive(viewType);
			}
		});

		return webviewInput;
	}

	registerReviver(
		viewType: string,
		reviver: WebviewReviver
	): IDisposable {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reveriver for 'viewType' already registered`);
		}

		this._revivers.set(viewType, reviver);
		this.tryRevive(viewType);

		return toDisposable(() => {
			this._revivers.delete(viewType);
		});
	}

	canRevive(
		webview: WebviewEditorInput
	): boolean {
		const viewType = webview.viewType;
		return this._revivers.has(viewType) && this._revivers.get(viewType).canRevive(webview);
	}

	tryRevive(
		viewType: string
	) {
		const reviver = this._revivers.get(viewType);
		if (!reviver) {
			return;
		}

		const toRevive = this._needingRevival.get(viewType);
		if (!toRevive) {
			return;
		}

		for (const webview of toRevive) {
			reviver.reviveWebview(webview);
		}
	}
}