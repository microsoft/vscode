/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { existsSync } from 'fs';
import * as path from 'path';

/**
 * Discovers the path to the pandoc executable that ships with Erdos.
 *
 * @returns The path to the pandoc executable, if it exists.
 */
export function getPandocPath(): string | undefined {
	const pandocPath = path.join(vscode.env.appRoot, 'quarto', 'bin', 'tools');
	const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';

	// Check for architecture-specific pandoc
	const archSpecificPath = path.join(pandocPath, arch, 'pandoc');
	if (existsSync(archSpecificPath)) {
		return path.join(pandocPath, arch);
	}

	if (existsSync(path.join(pandocPath, 'pandoc'))) {
		return pandocPath;
	} else {
		// If pandoc is not found, log a warning; Erdos should always ship with pandoc.
		console.warn(`No pandoc executable found in Erdos; expected one in ${pandocPath}`);
		return undefined;
	}
}
