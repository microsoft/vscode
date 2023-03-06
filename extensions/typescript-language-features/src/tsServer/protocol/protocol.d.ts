/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as ts from 'typescript/lib/tsserverlibrary';
export = ts.server.protocol;


declare enum ServerType {
	Syntax = 'syntax',
	Semantic = 'semantic',
}

declare module 'typescript/lib/tsserverlibrary' {
	namespace server.protocol {
		type TextInsertion = ts.TextInsertion;
		type ScriptElementKind = ts.ScriptElementKind;

		interface Response {
			readonly _serverType?: ServerType;
		}

		interface GetMoveToRefactoringFileSuggestionsRequest extends Request {
			command: 'getMoveToRefactoringFileSuggestions';
			arguments: GetMoveToRefactoringFileSuggestionsRequestArgs;
		}

		type GetMoveToRefactoringFileSuggestionsRequestArgs = FileLocationOrRangeRequestArgs & {
			triggerReason?: RefactorTriggerReason;
			kind?: string;
		};

		interface GetMoveToRefactoringFileSuggestionsResponse extends Response {
			body?: {
				newFilename: string;
				files: string[];
			};
		}

		interface GetEditsForMoveToFileRefactorRequest extends Request {
			command: 'getEditsForMoveToFileRefactor';
			arguments: GetEditsForMoveToFileRefactorRequestArgs;
		}

		interface GetEditsForMoveToFileRefactorResponse extends Response {
			body?: RefactorEditInfo;
		}

		type GetEditsForMoveToFileRefactorRequestArgs = FileLocationOrRangeRequestArgs & {
			refactor: string;
			action: string;
			filepath: string;
		};

		interface LinkedEditingRanges {
			ranges: TextSpan[];
			wordPattern?: string;
		}

		interface JsxLinkedEditRequest extends FileLocationRequest { }

		interface JsxLinkedEditResponse extends Response {
			body?: LinkedEditingRanges;
		}
	}
}
