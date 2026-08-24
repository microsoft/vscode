/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Type } from '@sinclair/typebox';

export {
	CancellationToken,
	CancellationTokenSource,
	Command,
	Disposable,
	DocumentUri,

	Position,

	Range,

	TextDocumentItem,
	TextEdit,
	VersionedTextDocumentIdentifier,

	WorkspaceFolder
} from 'vscode-languageserver-protocol';

const PositionSchema = Type.Object({
	line: Type.Integer({ minimum: 0 }),
	character: Type.Integer({ minimum: 0 }),
});

export const RangeSchema = Type.Object({
	start: PositionSchema,
	end: PositionSchema,
});