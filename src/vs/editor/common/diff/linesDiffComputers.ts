/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LegacyLinesDiffComputer } from './legacyLinesDiffComputer.js';
import { DefaultLinesDiffComputer } from './defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { getExternalLinesDiffComputer, getPackageLinesDiffComputer } from './externalLinesDiffComputer.js';
import { ILinesDiffComputer } from './linesDiffComputer.js';

export const linesDiffComputers = {
	getLegacy: () => new LegacyLinesDiffComputer(),
	/** The built-in algorithm. Only used as a fallback for `@vscode/diff` and for raw character changes. */
	getDefault: () => new DefaultLinesDiffComputer(),
	/** What `advanced` resolves to: `@vscode/diff` with wasm, or its TypeScript backend where wasm is unavailable. */
	getAdvanced: () => getPackageLinesDiffComputer(),
	getAdvancedExternal: () => getExternalLinesDiffComputer(false),
	getAdvancedWasm: () => getExternalLinesDiffComputer(true),
} satisfies Record<string, () => ILinesDiffComputer | Promise<ILinesDiffComputer>>;
