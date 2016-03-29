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

	// --- language features

	getCompletionsAtPosition(uri: string, offset: number): TPromise<ts.CompletionInfo> {
		throw notImplemented();
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): TPromise<ts.CompletionEntryDetails> {
		throw notImplemented();
	}

	getQuickInfoAtPosition(fileName: string, position: number): TPromise<ts.QuickInfo> {
		throw notImplemented();
	}

	getOccurrencesAtPosition(fileName: string, position: number): TPromise<ts.ReferenceEntry[]> {
		throw notImplemented();
	}
}

export default AbstractWorker;