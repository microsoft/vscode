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

		export interface MapCodeRequestArgs extends FileRequestArgs {
			/**
			 * The files and changes to try and apply/map.
			 */
			mapping: MapCodeRequestDocumentMapping;
		}

		export interface MapCodeRequestDocumentMapping {
			/**
			 * The specific code to map/insert/replace in the file.
			 */
			contents: string[];

			/**
			 * Areas of "focus" to inform the code mapper with. For example, cursor
			 * location, current selection, viewport, etc. Nested arrays denote
			 * priority: toplevel arrays are more important than inner arrays, and
			 * inner array priorities are based on items within that array. Items
			 * earlier in the arrays have higher priority.
			 */
			focusLocations?: TextSpan[][];
		}

		export interface MapCodeRequest extends FileRequest {
			command: 'mapCode';
			arguments: MapCodeRequestArgs;
		}

		export interface MapCodeResponse extends Response {
			body: readonly FileCodeEdits[];
		}
	}
}
