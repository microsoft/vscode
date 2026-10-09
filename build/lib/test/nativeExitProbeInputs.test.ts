/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { nativeExitProbeRequiredInputs, NativeExitProbeInputError, validateNativeExitProbeInputs } from '../../azure-pipelines/common/nativeExitProbeInputs.ts';
import { testCheckpoint } from '../../azure-pipelines/common/testCheckpoint.ts';

function fixture(): NodeJS.ProcessEnv {
	return {
		BUILDS_API_URL: 'https://dev.azure.com/fixture/Project/_apis/build/builds/1/',
		SYSTEM_ACCESSTOKEN: 'fixture-not-a-credential',
		SYSTEM_COLLECTIONURI: 'https://dev.azure.com/fixture/', SYSTEM_TEAMPROJECT: 'Project',
		BUILD_BUILDID: '1', BUILD_SOURCEVERSION: '0'.repeat(40), BUILD_SOURCEBRANCH: 'refs/heads/fixture',
		BUILD_SOURCESDIRECTORY: 'fixture-source', AGENT_BUILDDIRECTORY: 'fixture-build', AGENT_TEMPDIRECTORY: 'fixture-temp',
		VSCODE_ARCH: 'x64', VSCODE_QUALITY: 'insider', VSCODE_CIBUILD: 'True', VSCODE_PUBLISH: 'false', VSCODE_STEP_ON_IT: 'false',
		SYSTEM_TEAMPROJECTID: 'fixture-project', SYSTEM_STAGENAME: 'Windows', SYSTEM_JOBNAME: 'WindowsIntegration',
		SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
	};
}

for (const input of nativeExitProbeRequiredInputs) {
	test(`${input}: required input failure precedes any artifact polling`, () => {
		const env = fixture();
		delete env[input];
		let requests = 0;
		assert.throws(() => {
			validateNativeExitProbeInputs(env);
			requests++;
		}, error => error instanceof NativeExitProbeInputError && error.input === input && error.reason === 'missing');
		assert.equal(requests, 0);
	});
}

test('complete standard-template inputs allow their consumer exactly once', () => {
	let requests = 0;
	validateNativeExitProbeInputs(fixture());
	requests++;
	assert.equal(requests, 1);
});

test('a wrong build API identity is rejected without disclosing its value', () => {
	const invalidUrl = 'https://dev.azure.com/fixture/Project/_apis/build/builds/2/';
	const env: NodeJS.ProcessEnv = { ...fixture(), BUILDS_API_URL: invalidUrl };
	assert.throws(() => validateNativeExitProbeInputs(env), error => {
		assert.ok(error instanceof NativeExitProbeInputError);
		assert.equal(error.input, 'BUILDS_API_URL');
		assert.equal(error.reason, 'invalid');
		assert.ok(!JSON.stringify(error).includes(invalidUrl));
		assert.ok(!JSON.stringify(error).includes(env.SYSTEM_ACCESSTOKEN!));
		return true;
	});
});

test('partial probe cannot restore a full Integration pass or make a network request', async () => {
	const messages: string[] = [];
	let requests = 0;
	await testCheckpoint(['restore'], {
		...fixture(), AGENT_OS: 'Windows_NT', VSCODE_NATIVE_EXIT_PROBE: 'True',
	}, async () => {
		requests++;
		return Response.json({ value: [{ name: 'test-pass-Windows-WindowsIntegration-win32-x64-integration-electron', resource: { type: 'PipelineArtifact' } }] });
	}, message => messages.push(message));
	assert.equal(requests, 0);
	assert.ok(messages.includes('##vso[task.setvariable variable=TEST_CHECKPOINT_INTEGRATION_ELECTRON_HIT]false'));
	assert.ok(messages.includes('##vso[task.setvariable variable=TEST_CHECKPOINT_INTEGRATION_ELECTRON_READY]false'));
	assert.ok(!messages.some(message => message.endsWith(']true')));
});

test('partial probe cannot record or publish a full Integration pass checkpoint', async t => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'native-exit-checkpoint-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const messages: string[] = [];
	let requests = 0;
	await assert.rejects(testCheckpoint(['record', 'integration-electron'], {
		...fixture(), AGENT_OS: 'Windows_NT', AGENT_TEMPDIRECTORY: directory, VSCODE_NATIVE_EXIT_PROBE: 'true',
	}, async () => {
		requests++;
		return Response.json({});
	}, message => messages.push(message)), /cannot record a full-suite test checkpoint/);
	assert.equal(requests, 0);
	assert.deepStrictEqual(messages, []);
	assert.deepStrictEqual(readdirSync(directory), []);
	assert.ok(!existsSync(path.join(directory, 'test-checkpoints')));
});
