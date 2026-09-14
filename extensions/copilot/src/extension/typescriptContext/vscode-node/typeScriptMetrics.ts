/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { TypeScriptMetricsResult } from '../../../platform/languageContextProvider/common/typeScriptMetrics';
import type * as protocol from '../common/serverProtocol';

export function toTypeScriptMetricsResult(result: protocol.TypeScriptMetricsResult): TypeScriptMetricsResult {
	return {
		entities: result.entities.map(entity => ({
			...entity,
			range: new vscode.Range(
				entity.range.start.line,
				entity.range.start.character,
				entity.range.end.line,
				entity.range.end.character,
			),
		})),
	};
}
