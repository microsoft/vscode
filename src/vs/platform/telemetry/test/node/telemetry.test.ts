/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { buildTelemetryMessage } from '../../node/telemetry.js';

suite('Telemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const testDirectory = getRandomTestPath(tmpdir(), 'vsctests', 'telemetry');
	const appRoot = join(testDirectory, 'app');
	const builtinExtensionsPath = join(testDirectory, 'builtinExtensions');
	const extensionsPath = join(testDirectory, 'extensions');

	async function writeJson(path: string, value: object): Promise<void> {
		await promises.mkdir(join(path, '..'), { recursive: true });
		await promises.writeFile(path, JSON.stringify(value));
	}

	setup(async () => {
		await writeJson(join(appRoot, 'telemetry-core.json'), { events: { coreEvent: {} } });
		await writeJson(join(appRoot, 'telemetry-extensions.json'), { events: { aggregatedExtensionEvent: {} } });

		await writeJson(join(builtinExtensionsPath, 'packaging-name', 'package.json'), {
			publisher: 'Publisher',
			name: 'builtin-extension',
			version: '1.2.3'
		});
		await writeJson(join(builtinExtensionsPath, 'packaging-name', 'telemetry.json'), { events: { builtinEvent: {} } });

		await writeJson(join(builtinExtensionsPath, 'another-packaging-name', 'package.json'), {
			publisher: 'Publisher',
			name: 'builtin-only',
			version: '1.0.0'
		});
		await writeJson(join(builtinExtensionsPath, 'another-packaging-name', 'telemetry.json'), { events: { builtinOnlyEvent: {} } });

		await writeJson(join(builtinExtensionsPath, 'ignored', 'package.json'), {
			publisher: 'Publisher',
			name: 'ignored',
			version: '1.0.0'
		});

		await writeJson(join(extensionsPath, 'publisher.builtin-extension-1.2.3', 'telemetry.json'), { events: { userEvent: {} } });
		await writeJson(join(extensionsPath, 'publisher.user-extension-2.0.0', 'telemetry.json'), { events: { userOnlyEvent: {} } });
	});

	teardown(() => promises.rm(testDirectory, { recursive: true, force: true }));

	test('includes built-in extension telemetry using manifest identity', async () => {
		const result = JSON.parse(await buildTelemetryMessage(appRoot, extensionsPath, builtinExtensionsPath));

		assert.deepStrictEqual(result, {
			'publisher.builtin-extension-1.2.3': { events: { userEvent: {} } },
			'publisher.builtin-only-1.0.0': { events: { builtinOnlyEvent: {} } },
			'publisher.user-extension-2.0.0': { events: { userOnlyEvent: {} } },
			'vscode-core': { events: { coreEvent: {} } },
			'vscode-extensions': { events: { aggregatedExtensionEvent: {} } }
		});
	});
});
