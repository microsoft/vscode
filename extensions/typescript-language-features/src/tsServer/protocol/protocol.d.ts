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

		//#region MapCode
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
			body: FileCodeEdits[]
		}
		//#endregion

		//#region Paste
		export interface GetPasteEditsRequest extends Request {
			command: 'getPasteEdits';
			arguments: GetPasteEditsRequestArgs;
		}

		export interface GetPasteEditsRequestArgs extends FileRequestArgs {
			/** The text that gets pasted in a file.  */
			pastedText: string[];
			/** Locations of where the `pastedText` gets added in a file. If the length of the `pastedText` and `pastedLocations` are not the same,
			 *  then the `pastedText` is combined into one and added at all the `pastedLocations`.
			 */
			pasteLocations: TextSpan[];
			/** The source location of each `pastedText`. If present, the length of `spans` must be equal to the length of `pastedText`. */
			copiedFrom?: {
				file: string;
				spans: TextSpan[];
			};
		}

		export interface GetPasteEditsResponse extends Response {
			body: PasteEditsAction;
		}
		export interface PasteEditsAction {
			edits: FileCodeEdits[];
			fixId?: {};
		}
		//#endregion
	}
}


