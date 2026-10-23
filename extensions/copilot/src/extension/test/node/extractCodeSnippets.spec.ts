/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { FileChunk } from '../../../platform/chunking/common/chunk';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { getSearchResults } from '../../workspaceSemanticSearch/node/semanticSearchTextSearchProvider';

suite('Extract Code Snippets From Files', () => {

	const uri1 = URI.file('/c:/Users/file1.ts');
	const uri2 = URI.file('/c:/Users/file2.ts');

	const fileReader = async (uri: URI): Promise<Uint8Array> => {
		if (uri === uri1) {
			return Buffer.from(`
const express = require("express");
const patchHandler = require("./patchHandler");
const app = express();
const port = 3001;

app.get("/", (req, res) => {
	console.log('\${new Date()} \${req.method} \${req.path}');
	res.send("Hello world!");
});

const b = [1, 2, 3, 4, 5];

// This comment shouldn't be included
app.post("/", (req, res) => {
	console.log('\${new Date()} \${req.method} \${req.path}');
	// Fake comment
	// That should be included
	res.send("Post");
});

app.use("/", patchHandler);

app.listen(port, () => console.log('Example app listening on port \${port}!'));
`);
		} else {
			return Buffer.from(`
const express = require("express");
const router = express.Router();

router.patch("/", (req, res) => {
	console.log('\${new Date()} \${req.method} \${req.path}');
	res.send("Patch");
});

module.exports = router;
`);
		}
	};


	test('Return the ranges from the code snippet', async () => {
		const range1 = new Range(14, 0, 19, 2);
		const range2 = new Range(4, 0, 7, 2);
		const fileResults: FileChunk[] = [];
		fileResults.push({
			file: uri1,
			range: range1,
			text: `
app.post("/", (req, res) => {
	console.log('\${new Date()} \${req.method} \${req.path}');
	res.send("Post");
});`,
			rawText: undefined,
		});
		fileResults.push({
			file: uri2,
			range: range2,
			text: `
router.patch("/", (req, res) => {
	console.log('\${new Date()} \${req.method} \${req.path}');
	res.send("Patch");
});
`,
			rawText: undefined,
		});

		const results = await getSearchResults(fileReader, fileResults);
		assert.strictEqual(results.length, 2);
		assert.strictEqual(results[0].ranges[0].sourceRange.start.line, 14);
		assert.strictEqual(results[0].ranges[0].sourceRange.end.line, 19);
		assert.strictEqual(results[1].ranges[0].sourceRange.start.line, 4);
		assert.strictEqual(results[1].ranges[0].sourceRange.end.line, 7);
	});
});
