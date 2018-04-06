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
import { TPromise } from 'vs/base/common/winjs.base';

export const IWebviewEditorService = createDecorator<IWebviewEditorService>('webviewEditorService');

export interface IWebviewEditorService {
	_serviceBrand: any;

	createWebview(
		viewType: string,
		title: string,
		column: Position,
		options: WebviewInputOptions,
		extensionFolderPath: string,
		events: WebviewEvents
	): WebviewEditorInput;

	reviveWebview(
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
	): TPromise<void>;
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

export class WebviewEditorService implements IWebviewEditorService {
	_serviceBrand: any;

	private readonly _revivers = new Map<string, WebviewReviver>();
	private _awaitingRevival: { input: WebviewEditorInput, resolve: (x: any) => void }[] = [];

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
			this._editorService.openEditor(webview, { preserveFocus: false }, column);
		} else {
			this._editorGroupService.moveEditor(webview, webview.position, column, { preserveFocus: false });
		}
	}

	reviveWebview(
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
			reviveWebview: async (webview: WebviewEditorInput): TPromise<void> => {
				const didRevive = await this.tryRevive(webview);
				if (didRevive) {
					return;
				}
				// A reviver may not be registered yet. Put into queue and resolve promise when we can revive
				let resolve: (value: void) => void;
				const promise = new TPromise<void>(r => { resolve = r; });
				this._awaitingRevival.push({ input: webview, resolve });
				return promise;
			}
		});

		return webviewInput;
	}

	registerReviver(
		viewType: string,
		reviver: WebviewReviver
	): IDisposable {
		if (this._revivers.has(viewType)) {
			throw new Error(`Reviver for '${viewType}' already registered`);
		}

		this._revivers.set(viewType, reviver);

		// Resolve any pending views

		const toRevive = this._awaitingRevival.filter(x => x.input.viewType === viewType);
		this._awaitingRevival = this._awaitingRevival.filter(x => x.input.viewType !== viewType);

		for (const input of toRevive) {
			reviver.reviveWebview(input.input).then(() => input.resolve(void 0));
		}

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
		webview: WebviewEditorInput
	): boolean {
		const reviver = this._revivers.get(webview.viewType);
		if (!reviver) {
			return false;
		}

		reviver.reviveWebview(webview);
		return true;
	}
}