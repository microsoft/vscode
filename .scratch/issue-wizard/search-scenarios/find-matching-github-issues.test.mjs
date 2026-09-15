/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { evaluateSearchScenario } from './find-matching-github-issues.evaluator.mjs';

const scenario = JSON.parse(await readFile(new URL('./find-matching-github-issues.scenario.json', import.meta.url), 'utf8'));

/** Returns a named deterministic search case. */
function caseById(candidate, id) {
	return candidate.cases.find(searchCase => searchCase.id === id);
}

test('accepts deterministic authenticated, anonymous, no-result, and failure routes', () => {
	assert.deepStrictEqual(evaluateSearchScenario(scenario), {
		passed: true,
		violations: []
	});
});

test('accepts concise relevance wording that cites the same matching evidence', () => {
	const paraphrased = structuredClone(scenario);
	const authenticated = caseById(paraphrased, 'authenticated-gh');
	const summary = authenticated.transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	summary.text = '#241356 looks like the same terminal reload failure: both reports mention a blank terminal and pty host reconnection. Add any new reproduction evidence there instead of opening a duplicate.';

	assert.deepStrictEqual(evaluateSearchScenario(paraphrased), {
		passed: true,
		violations: []
	});
});

test('rejects an unscoped or incorrectly encoded anonymous query', () => {
	const unsafe = structuredClone(scenario);
	const anonymous = caseById(unsafe, 'anonymous-rest');
	const search = anonymous.transcript.find(event => event.kind === 'search' && event.transport === 'anonymousRest');
	search.query = 'terminal blank';
	search.url = 'https://api.github.com/search/issues?q=terminal blank';

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'anonymous-rest: Anonymous search query is not fixed to microsoft/vscode issues with a nonempty q value.',
			'anonymous-rest: Anonymous Search Issues URL does not exactly encode its query.'
		]
	});
});

test('rejects the generic issues endpoint or an empty REST q value', () => {
	const unsafe = structuredClone(scenario);
	const rateLimited = caseById(unsafe, 'rate-limit');
	const search = rateLimited.transcript.find(event => event.kind === 'search');
	search.query = '';
	search.url = 'https://api.github.com/issues';

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'rate-limit: Anonymous search query is not fixed to microsoft/vscode issues with a nonempty q value.',
			'rate-limit: Anonymous Search Issues URL does not exactly encode its query.'
		]
	});
});

test('rejects REST qualifiers embedded in the GitHub CLI positional query', () => {
	const unsafe = structuredClone(scenario);
	const authenticated = caseById(unsafe, 'authenticated-gh');
	const search = authenticated.transcript.find(event => event.kind === 'search');
	search.query += ' is:issue repo:microsoft/vscode';
	const repositoryIndex = search.command.arguments.indexOf('--repo');
	search.command.arguments.splice(repositoryIndex, 0, 'is:issue', 'repo:microsoft/vscode');

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'authenticated-gh: GitHub CLI search is not fixed to the requested microsoft/vscode issue scope with transport-specific syntax.'
		]
	});
});

test('rejects an unfocused authenticated GitHub CLI query', () => {
	const unfocused = structuredClone(scenario);
	const authenticated = caseById(unfocused, 'authenticated-gh');
	const search = authenticated.transcript.find(event => event.kind === 'search' && event.transport === 'gh');
	search.query = 'terminal cursor';
	const repositoryIndex = search.command.arguments.indexOf('--repo');
	search.command.arguments.splice(2, repositoryIndex - 2, 'terminal', 'cursor');

	assert.deepStrictEqual(evaluateSearchScenario(unfocused), {
		passed: false,
		violations: [
			'authenticated-gh: Search query does not contain focused terms derived from the reported title, symptom, and relevant terms.'
		]
	});
});

test('derives focused query expectations from the reported input', () => {
	const stale = structuredClone(scenario);
	const authenticated = caseById(stale, 'authenticated-gh');
	authenticated.input.title = 'Cursor vanishes when shell integration activates';
	authenticated.input.symptom = 'Cursor vanishes when shell integration activates';
	authenticated.input.relevantTerms = ['shell integration'];

	assert.deepStrictEqual(evaluateSearchScenario(stale), {
		passed: false,
		violations: [
			'authenticated-gh: Search query does not contain focused terms derived from the reported title, symptom, and relevant terms.'
		]
	});
});

test('accepts an exactly encoded anonymous endpoint without prescribing sort or page policy', () => {
	const minimal = structuredClone(scenario);
	const anonymous = caseById(minimal, 'anonymous-rest');
	const search = anonymous.transcript.find(event => event.kind === 'search' && event.transport === 'anonymousRest');
	search.url = `https://api.github.com/search/issues?q=${encodeURIComponent(search.query)}`;

	assert.deepStrictEqual(evaluateSearchScenario(minimal), {
		passed: true,
		violations: []
	});
});

test('rejects the wrong transport and any setup or publication side effect', () => {
	const unsafe = structuredClone(scenario);
	const anonymous = caseById(unsafe, 'anonymous-rest');
	anonymous.transcript.push({ kind: 'search', transport: 'gh', query: 'terminal', results: [] });
	anonymous.transcript.push({ kind: 'action', name: 'installGitHubCli' });
	anonymous.transcript.push({ kind: 'action', name: 'createIssue' });

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'anonymous-rest: An unusable GitHub CLI did not fall back exclusively to anonymous REST search.',
			'anonymous-rest: Search-only flow performed forbidden action installGitHubCli.',
			'anonymous-rest: Search-only flow performed forbidden action createIssue.'
		]
	});
});

test('rejects a request to install or authenticate GitHub tooling', () => {
	const unsafe = structuredClone(scenario);
	const anonymous = caseById(unsafe, 'anonymous-rest');
	const summary = anonymous.transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	summary.text += ' You should install the GitHub CLI and sign in before we continue.';

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'anonymous-rest: Search flow asks the user to install GitHub CLI, sign in, or create an account.'
		]
	});
});

test('rejects synonymous authentication wording and every generic side-effect event', () => {
	const unsafe = structuredClone(scenario);
	const anonymous = caseById(unsafe, 'anonymous-rest');
	const summary = anonymous.transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	summary.text += ' Authenticate with GitHub to continue.';
	unsafe.cases[0].transcript.push({ kind: 'toolCall', name: 'addIssueComment' });
	anonymous.transcript.push({ kind: 'action', name: 'ghAuthLogin' });

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'authenticated-gh: Search-only flow performed forbidden action addIssueComment.',
			'anonymous-rest: Search flow asks the user to install GitHub CLI, sign in, or create an account.',
			'anonymous-rest: Search-only flow performed forbidden action ghAuthLogin.'
		]
	});
});

test('rejects irrelevant capability narration and unexplained duplicate recommendations', () => {
	const unsafe = structuredClone(scenario);
	const authenticated = caseById(unsafe, 'authenticated-gh');
	authenticated.transcript.splice(1, 0, { kind: 'assistant', text: 'I checked whether gh is installed and whether you are signed in.' });
	const summary = authenticated.transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	summary.text = '#241356 is relevant. Use it.';
	summary.matches[0].relevance = 'Different unrelated behavior.';

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'authenticated-gh: Strong-match summary does not explain the shared symptom terms.',
			'authenticated-gh: Internal GitHub CLI capability probing was narrated to the user.'
		]
	});
});

test('requires inspecting the strong candidate title and body before judging relevance', () => {
	const incomplete = structuredClone(scenario);
	const duplicatePanel = caseById(incomplete, 'duplicate-language-model-panel');
	const inspection = duplicatePanel.transcript.find(event => event.kind === 'candidateInspection');
	duplicatePanel.transcript.splice(duplicatePanel.transcript.indexOf(inspection), 1);

	assert.deepStrictEqual(evaluateSearchScenario(incomplete), {
		passed: false,
		violations: [
			'duplicate-language-model-panel: Strong match was not inspected by title and body before relevance was judged.'
		]
	});
});

test('rejects verbose summaries and presented matches without relevance explanations', () => {
	const unclear = structuredClone(scenario);
	const authenticated = caseById(unclear, 'authenticated-gh');
	const summary = authenticated.transcript.find(event => event.kind === 'assistant' && event.purpose === 'searchSummary');
	summary.text += ` ${'This repeats without adding evidence. '.repeat(20)}`;
	summary.matches.push({ number: 198201, relevance: '' });

	assert.deepStrictEqual(evaluateSearchScenario(unclear), {
		passed: false,
		violations: [
			'authenticated-gh: Result summary is not concise.',
			'authenticated-gh: Presented match #198201 has no concise relevance explanation.'
		]
	});
});

test('rejects failures or no-result searches that discard the investigation', () => {
	const unsafe = structuredClone(scenario);
	for (const id of ['no-results', 'rate-limit', 'network-failure', 'malformed-response']) {
		caseById(unsafe, id).transcript.at(-1).recoverable = false;
	}

	assert.deepStrictEqual(evaluateSearchScenario(unsafe), {
		passed: false,
		violations: [
			'no-results: No-result search does not preserve a useful next step.',
			'rate-limit: rateLimit failure does not preserve the investigation and a useful fallback.',
			'network-failure: network failure does not preserve the investigation and a useful fallback.',
			'malformed-response: malformedResponse failure does not preserve the investigation and a useful fallback.'
		]
	});
});

test('requires one broader unquoted retry before concluding there is no matching issue', () => {
	const incomplete = structuredClone(scenario);
	const noResults = caseById(incomplete, 'no-results');
	const searches = noResults.transcript.filter(event => event.kind === 'search');
	noResults.transcript.splice(noResults.transcript.indexOf(searches[1]), 1);
	noResults.expected.searchCount = 1;

	assert.deepStrictEqual(evaluateSearchScenario(incomplete), {
		passed: false,
		violations: [
			'no-results: Empty focused results were not retried once with a broader unquoted query.'
		]
	});
});

test('rejects nominal recovery metadata without useful preservation and next-step guidance', () => {
	const unhelpful = structuredClone(scenario);
	for (const id of ['no-results', 'rate-limit', 'network-failure', 'malformed-response']) {
		const recovery = caseById(unhelpful, id).transcript.find(event => event.kind === 'assistant' && event.purpose === 'recovery');
		recovery.text = '';
	}

	assert.deepStrictEqual(evaluateSearchScenario(unhelpful), {
		passed: false,
		violations: [
			'no-results: No-result search does not preserve a useful next step.',
			'rate-limit: rateLimit failure does not preserve the investigation and a useful fallback.',
			'network-failure: network failure does not preserve the investigation and a useful fallback.',
			'malformed-response: malformedResponse failure does not preserve the investigation and a useful fallback.'
		]
	});
});

test('rejects empty, malformed, or unknown-transport scenario cases', () => {
	const unknown = structuredClone(scenario);
	caseById(unknown, 'authenticated-gh').expected.transport = 'browser';
	assert.deepStrictEqual({
		empty: evaluateSearchScenario({ repository: 'microsoft/vscode', cases: [] }),
		malformed: evaluateSearchScenario({ repository: 'microsoft/vscode', cases: [{}] }),
		unknownTransport: evaluateSearchScenario(unknown)
	}, {
		empty: {
			passed: false,
			violations: ['Scenario must contain at least one search case.']
		},
		malformed: {
			passed: false,
			violations: ['Scenario case at index 0 is malformed.']
		},
		unknownTransport: {
			passed: false,
			violations: ['authenticated-gh: Expected transport must be gh or anonymousRest.']
		}
	});
});
