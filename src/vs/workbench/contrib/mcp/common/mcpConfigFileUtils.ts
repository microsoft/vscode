/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findNodeAtLocation, parseTree as jsonParseTree } from '../../../../base/common/json.js';
import { Location } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';

export const getMcpServerMapping = (opts: {
	model: ITextModel;
	// Path to MCP servers in the config.
	pathToServers: string[];
}): Map<string, Location> => {
	const tree = jsonParseTree(opts.model.getValue());
	const servers = findNodeAtLocation(tree, opts.pathToServers);
	if (!servers || servers.type !== 'object') {
		return new Map();
	}

	const result = new Map<string, Location>();
	for (const node of servers.children || []) {
		if (node.type !== 'property' || node.children?.[0]?.type !== 'string') {
			continue;
		}

		const start = opts.model.getPositionAt(node.offset);
		const end = opts.model.getPositionAt(node.offset + node.length);
		result.set(node.children[0].value, {
			uri: opts.model.uri,
			range: {
				startLineNumber: start.lineNumber,
				startColumn: start.column,
				endLineNumber: end.lineNumber,
				endColumn: end.column,
			}
		});
	}

	return result;
};
