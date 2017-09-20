/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vscode';

import * as Proto from '../protocol';


export const textSpanToRange = (span: Proto.TextSpan) =>
	new Range(
		span.start.line - 1, span.start.offset - 1,
		span.end.line - 1, span.end.offset - 1);