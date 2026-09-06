/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { readdirSync } from 'fs';
import path from 'path';

export default new class NoTestOnly implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		// compute/use real file path because LSP eslint might see cached
		// filenames from VSCode that aren't using the latest casing
		let realFilename: string | undefined;
		const filename = path.basename(context.filename);
		const filenames = readdirSync(path.dirname(context.filename));
		for (const name of filenames) {
			if (name.toLowerCase() === filename.toLowerCase()) {
				realFilename = name;
				break;
			}
		}

		if (!realFilename) {
			throw new Error(`Filename not found ${filename}`)
		}

		// const filename = path.basename(context.filename);
		const idx = realFilename.indexOf('.');
		const realFilenameName = idx !== -1 ? realFilename.substring(0, idx) : realFilename;

		const regex = /^[a-z0-9-]+([A-Z0-9-][a-z0-9-]*)*$/;
		if (!regex.test(realFilenameName)) {
			context.report({
				loc: {
					line: 0,
					column: 0,
				},
				message: `Filename '${realFilename}' should be in camelCase.`,
			});

		}

		return {};
	}
};
