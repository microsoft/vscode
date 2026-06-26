/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';

import { URI } from '../../../../util/vs/base/common/uri';
import { resolveErrorFile } from '../../common/terminalOutput';

describe('resolveErrorFile', () => {

	const folder = URI.file('/abs/workspace');

	it('returns undefined when there are no workspace folders', () => {
		expect(resolveErrorFile('src/foo.ts', '/abs/workspace', [])).toBeUndefined();
	});

	it('resolves a relative path against cwd inside the workspace', () => {
		const r = resolveErrorFile('src/foo.ts', '/abs/workspace', [folder]);
		expect(r?.fsPath).toBe('/abs/workspace/src/foo.ts');
	});

	it('strips a leading `./` before resolution', () => {
		const r = resolveErrorFile('./main.go', '/abs/workspace', [folder]);
		expect(r?.fsPath).toBe('/abs/workspace/main.go');
	});

	it('accepts an absolute path inside the workspace', () => {
		const r = resolveErrorFile('/abs/workspace/pkg/foo.go', undefined, [folder]);
		expect(r?.fsPath).toBe('/abs/workspace/pkg/foo.go');
	});

	it('rejects absolute paths outside any workspace folder', () => {
		expect(resolveErrorFile('/usr/include/stdio.h', undefined, [folder])).toBeUndefined();
	});

	it('rejects relative paths that resolve outside the workspace via ..', () => {
		expect(resolveErrorFile('../other/foo.ts', '/abs/workspace', [folder])).toBeUndefined();
	});

	it('falls back to workspace folders when cwd is unavailable', () => {
		const r = resolveErrorFile('src/foo.ts', undefined, [folder]);
		expect(r?.fsPath).toBe('/abs/workspace/src/foo.ts');
	});
});
