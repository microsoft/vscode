/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { SimulationTestRuntime } from '../base/stest';
import { INLINE_CHANGED_DOC_TAG } from './shared/sharedTypes';

/**
 * Test runtime used when running external scenarios (`--external-scenarios`, e.g. NES external scenarios).
 */
export class ExternalSimulationTestRuntime extends SimulationTestRuntime {

	constructor(
		baseDir: string,
		testOutcomeDir: string,
		runNumber: number
	) {
		super(baseDir, testOutcomeDir, runNumber);
	}

	override async writeFile(filename: string, contents: Uint8Array | string, tag: string): Promise<string> {
		if (tag === INLINE_CHANGED_DOC_TAG) {
			// This is a write file for a workspace file, we'll rename it to <basename>.post.<ext>
			const ext = path.extname(filename);
			const basename = path.basename(filename, ext);
			filename = `${basename}.post${ext}`;
		}
		return super.writeFile(filename, contents, tag);
	}

	protected override massageFilename(filename: string): string {
		const ext = path.extname(filename);
		const basename = path.basename(filename, ext);
		return `${basename}-${this.runNumber}${ext}`;
	}
}
