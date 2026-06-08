/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const UsagesToolId = 'vscode_listCodeUsages';

const BaseModelDescription = `Read the source code of a syntactic scope around a usage returned by \`vscode_listCodeUsages\`.

Use this — not \`read_file\` — whenever you want to see the code around a usage in a \`vscode_listCodeUsages\` result. The scope ranges are pre-computed
from the language service, so this tool returns exactly the lines needed to understand the usage in context, with no guessing about line numbers.

Inputs:
- \`usageId\` (string, required): the \`usageId\` of a usage from a recent \`vscode_listCodeUsages\` result.
- \`depth\` (integer, optional, default 0): which enclosing scope to read.
	- \`0\` = innermost scope (e.g. the function or method containing the usage). Start here.
	- \`1\` = next scope outward (e.g. the enclosing class).
	- \`2\`, \`3\`, ... = progressively wider scopes, as listed in the usage's \`scopes\` array.

When to increase \`depth\`:
- Call with \`depth: 0\` first.
- Only call again with \`depth: 1\` if the innermost scope was genuinely insufficient to answer your question — for example, the usage refers to a field or helper defined elsewhere in the same class.
- Continue incrementing only as needed. Do not skip ahead to a large depth "to be safe".

- Output:
- \`file\` — workspace-relative path of the source file.
- \`scope\` — human-readable label of the scope being returned (e.g. \`method Server.start\`).
- \`startLine\`, \`endLine\` — 1-based inclusive line range covered by the returned content.
- \`content\` — the source text of that range.
- \`hasWiderScope\` — \`true\` if a larger scope is available at \`depth + 1\`.
`;

