/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateDeferredUpdateRecovery, evaluateDeniedMetadataRecovery, evaluateUpdateScenario } from './resolve-by-updating-vscode.evaluator.mjs';

const scenario = JSON.parse(await readFile(new URL('./resolve-by-updating-vscode.scenario.json', import.meta.url), 'utf8'));
const deniedScenario = JSON.parse(await readFile(new URL('./resolve-by-updating-vscode-metadata-denied.scenario.json', import.meta.url), 'utf8'));
const deferredScenario = JSON.parse(await readFile(new URL('./resolve-by-updating-vscode-install-deferred.scenario.json', import.meta.url), 'utf8'));

test('accepts the deterministic Stable update resolution', () => {
	assert.deepStrictEqual(evaluateUpdateScenario(scenario), {
		passed: true,
		violations: []
	});
});

test('accepts semantically equivalent recommendation wording', () => {
	const paraphrased = structuredClone(scenario);
	const recommendation = paraphrased.transcript.find(event => event.kind === 'assistant' && event.text.includes('Update Visual Studio Code'));
	recommendation.text = 'Install Visual Studio Code 1.106.1 or newer from the Stable channel. That build contains the Settings search focus fix missing from 1.106.0. Restart the app, test the search box again, and let me know if it keeps focus.';

	assert.deepStrictEqual(evaluateUpdateScenario(paraphrased), {
		passed: true,
		violations: []
	});
});

test('keeps the update investigation recoverable when metadata access is denied', () => {
	assert.deepStrictEqual(evaluateDeniedMetadataRecovery(deniedScenario), {
		passed: true,
		violations: []
	});
});

test('accepts a concise paraphrase after metadata access is denied', () => {
	const paraphrased = structuredClone(deniedScenario);
	const continuation = paraphrased.transcript.find(event => event.kind === 'assistant' && event.text.startsWith("That's okay"));
	continuation.text = 'Your build details stayed private. You can tell me the version and channel yourself, or keep this investigation and retry the metadata check another time.';
	paraphrased.transcript.find(event => event.kind === 'outcome').nextSteps = ['manualMetadata'];

	assert.deepStrictEqual(evaluateDeniedMetadataRecovery(paraphrased), {
		passed: true,
		violations: []
	});

	const laterOnly = structuredClone(paraphrased);
	laterOnly.transcript.find(event => event.kind === 'outcome').nextSteps = ['retryMetadataLater'];
	assert.deepStrictEqual(evaluateDeniedMetadataRecovery(laterOnly), {
		passed: true,
		violations: []
	});
});

test('rejects denied-metadata recovery that omits a user-controlled path or privacy outcome', () => {
	const missingManualPath = structuredClone(deniedScenario);
	missingManualPath.transcript.find(event => event.kind === 'outcome').nextSteps = [];
	const disclosed = structuredClone(deniedScenario);
	disclosed.transcript.find(event => event.kind === 'outcome').metadataDisclosed = true;

	assert.deepStrictEqual({
		missingManualPath: evaluateDeniedMetadataRecovery(missingManualPath).violations,
		disclosed: evaluateDeniedMetadataRecovery(disclosed).violations
	}, {
		missingManualPath: ['The conversation does not preserve a user-controlled manual-or-later metadata path.'],
		disclosed: ['Denied metadata access exposed VS Code build metadata.']
	});
});

test('rejects a nominally recoverable denial that forces GitHub or contributor setup', () => {
	const forced = structuredClone(deniedScenario);
	Object.assign(forced.transcript.find(event => event.kind === 'outcome'), {
		forcedGitHub: true,
		forcedSetup: true
	});

	assert.deepStrictEqual(evaluateDeniedMetadataRecovery(forced), {
		passed: false,
		violations: ['The denied route forces GitHub access or contributor setup.']
	});
});

test('preserves a resumable verification plan when the update cannot be installed', () => {
	assert.deepStrictEqual(evaluateDeferredUpdateRecovery(deferredScenario), {
		passed: true,
		violations: []
	});
});

test('rejects unsafe or unverified update routes', () => {
	const unsafe = structuredClone(scenario);
	unsafe.knownFix.quality = 'insider';
	unsafe.transcript.splice(-2, 0, { kind: 'action', name: 'prepareWorkspaceForFix' });
	unsafe.transcript.at(-1).verifiedByUser = false;

	assert.deepStrictEqual(evaluateUpdateScenario(unsafe), {
		passed: false,
		violations: [
			'The known fix is not a newer build on the appropriate product channel.',
			'The update route performed side-effect action prepareWorkspaceForFix.',
			'The scenario does not end in a user-verified VS Code update resolution.'
		]
	});
});

test('requires a post-update user confirmation event before resolving', () => {
	const unconfirmed = structuredClone(scenario);
	unconfirmed.transcript = unconfirmed.transcript.filter(event => event.kind !== 'user' || !event.text.includes('After the update'));

	assert.deepStrictEqual(evaluateUpdateScenario(unconfirmed), {
		passed: false,
		violations: ['The scenario does not include post-recommendation user confirmation that the symptom is resolved.']
	});
});
