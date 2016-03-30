/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {notImplemented} from 'vs/base/common/errors';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';


export interface IRawModelData {
	url:string;
	versionId:number;
	value:editorCommon.IRawText;
}

abstract class AbstractWorker implements IRequestHandler {

	_requestHandlerTrait: any;

	// --- model sync

	acceptNewModel(data: IRawModelData): void {
		throw notImplemented();
	}

	acceptModelChanged(uri: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		throw notImplemented();
	}

	acceptRemovedModel(uri: string): void {
		throw notImplemented();
	}

	acceptDefaults(options: ts.CompilerOptions, extraLibs: { [path: string]: string }): TPromise<void> {
		throw notImplemented();
	}

	// --- language features

	getCompletionsAtPosition(uri: string, offset: number): TPromise<ts.CompletionInfo> {
		throw notImplemented();
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): TPromise<ts.CompletionEntryDetails> {
		throw notImplemented();
	}

	getSignatureHelpItems(fileName: string, position:number): TPromise<ts.SignatureHelpItems> {
		throw notImplemented();
	}

	getQuickInfoAtPosition(fileName: string, position: number): TPromise<ts.QuickInfo> {
		throw notImplemented();
	}

	getOccurrencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		throw notImplemented();
	}

	getDefinitionAtPosition(fileName: string, position: number): TPromise<ts.DefinitionInfo[]> {
		throw notImplemented();
	}

	getReferencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		throw notImplemented();
	}

	getNavigationBarItems(fileName: string): TPromise<ts.NavigationBarItem[]> {
		throw notImplemented();
	}

	getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}

	getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: ts.FormatCodeOptions): TPromise<ts.TextChange[]> {
		throw notImplemented();
	}
}

export default AbstractWorker;