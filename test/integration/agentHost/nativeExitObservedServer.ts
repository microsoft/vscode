/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeExitObserver, validateNativeExitRecord } from './nativeExitObserver.ts';

const output = process.env['AGENT_HOST_NATIVE_EXIT_RECORDS'];
const runtime = process.env['AGENT_HOST_NATIVE_EXIT_RUNTIME'];
const serverMain = process.env['AGENT_HOST_NATIVE_EXIT_SERVER_MAIN'];
assert.ok(output && runtime && serverMain);
const { CopilotClient } = await import('@github/copilot-sdk');
const sdkEntry = createRequire(import.meta.url).resolve('@github/copilot-sdk');
const metadata: unknown = JSON.parse(readFileSync(join(dirname(sdkEntry), '../../package.json'), 'utf8'));
assert.ok(metadata !== null && typeof metadata === 'object');
const sdkPackage: Record<string, unknown> = Object.fromEntries(Object.entries(metadata));
assert.equal(sdkPackage.version, '1.0.18-preview.1');
assert.ok(typeof sdkPackage.version === 'string');
const sdkVersion = sdkPackage.version;
const hostSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex');
const nativeSha256 = createHash('sha256').update(readFileSync(runtime)).digest('hex');
const observer = new NativeExitObserver(record => {
	const safeRecord = record.event === 'observerReady' ? { ...record, hostSha256, nativeSha256, sdkVersion } : record;
	validateNativeExitRecord(safeRecord);
	appendFileSync(output, JSON.stringify(safeRecord) + '\n');
}, runtime);
observer.install(CopilotClient.prototype);
process.once('exit', () => observer.dispose());
await import(pathToFileURL(serverMain).href);
