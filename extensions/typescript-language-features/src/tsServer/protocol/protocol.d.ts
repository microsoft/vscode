/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type ts from '../../../../node_modules/typescript/lib/typescript';
export = ts.server.protocol;


declare enum ServerType {
	Syntax = 'syntax',
	Semantic = 'semantic',
}

declare module '../../../../node_modules/typescript/lib/typescript' {
	namespace server.protocol {
		type TextInsertion = ts.TextInsertion;
		type ScriptElementKind = ts.ScriptElementKind;

		interface Response {
			readonly _serverType?: ServerType;
		}

		//#region PreparePasteEdits
		interface PreparePasteEditsRequest extends FileRequest {
			command: 'preparePasteEdits';
			arguments: PreparePasteEditsRequestArgs;
		}
		interface PreparePasteEditsRequestArgs extends FileRequestArgs {
			copiedTextSpan: TextSpan[];
		}
		interface PreparePasteEditsResponse extends Response {
			body: boolean;
		}
		//#endregion
	}
}
