/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { appendFileSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeExitObserver, validateNativeExitRecord } from './nativeExitObserver.ts';

const directory = process.env['AGENT_HOST_NATIVE_EXIT_RECORDS_DIRECTORY'];
const output = directory ? join(directory, `host-${process.pid}-${randomUUID()}.jsonl`) : process.env['AGENT_HOST_NATIVE_EXIT_RECORDS'];
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
const rawTestContext: unknown = JSON.parse(process.env['AGENT_HOST_NATIVE_EXIT_TEST_CONTEXT'] ?? 'null');
assert.ok(rawTestContext !== null && typeof rawTestContext === 'object' && !Array.isArray(rawTestContext));
const testContext = Object.fromEntries(Object.entries(rawTestContext));
assert.ok(Object.keys(testContext).length === 4 && Object.keys(testContext).every(key => ['testPid', 'testNodeVersion', 'testElectronVersion', 'testSha256'].includes(key)));
const observer = new NativeExitObserver(record => {
	const safeRecord = record.event === 'observerReady' ? { ...testContext, ...record, hostSha256, nativeSha256, sdkVersion } : record;
	const tagged = directory ? { ...safeRecord, targetCase: process.env['AGENT_HOST_NATIVE_EXIT_TARGET_CASE'] === 'true' } : safeRecord;
	validateNativeExitRecord(tagged);
	appendFileSync(output, JSON.stringify(tagged) + '\n');
}, runtime);
observer.install(CopilotClient.prototype);
process.once('exit', () => observer.dispose());
await import(pathToFileURL(serverMain).href);
