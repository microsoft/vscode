/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {notImplemented} from 'vs/base/common/errors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';


export interface IRawModelData {
	url:string;
	versionId:number;
	value:editorCommon.IRawText;
}

abstract class AbstractWorker {

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
}

export default AbstractWorker;