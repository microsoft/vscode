/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skill = await readFile(new URL('../../src/vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md', import.meta.url), 'utf8');

test('no-symptom intake advertises the always-available floating capture bar', () => {
	const noSymptomInstruction = skill.match(/If neither the initial message nor an attachment contains a symptom[\s\S]*?Treat a clear description or screenshot/u)?.[0] ?? '';

	assert.deepStrictEqual({
		offersDescription: /describe/iu.test(noSymptomInstruction),
		offersExistingScreenshot: /attach(?:ed)? (?:an )?(?:existing )?screenshot/u.test(noSymptomInstruction),
		conditionsFloatingCapture: /if .*floating Screenshot button.*(?:visible|available)/iu.test(noSymptomInstruction),
		unconditionallyDirectsToCapture: /or use the floating Screenshot button/u.test(noSymptomInstruction),
	}, {
		offersDescription: true,
		offersExistingScreenshot: true,
		conditionsFloatingCapture: false,
		unconditionallyDirectsToCapture: true,
	});
});

test('approval-gated diagnostics use the tool card as the single consent surface', () => {
	const investigation = skill.match(/## 2\. Investigate[\s\S]*?### Search for matching GitHub issues/u)?.[0] ?? '';

	assert.deepStrictEqual({
		invokesInSameResponse: /Before invoking `searchVSCodeLogs`[\s\S]*invoke it in that same response/iu.test(investigation),
		usesToolApprovalAsOnlyConsent: /approval card is the single consent surface/iu.test(investigation),
		forbidsAskUserPermission: /never call `ask_user` merely to ask permission/iu.test(investigation),
		forbidsConcurrentLogReads: /never call it concurrently or submit multiple log searches in one tool batch/iu.test(investigation),
	}, {
		invokesInSameResponse: true,
		usesToolApprovalAsOnlyConsent: true,
		forbidsAskUserPermission: true,
		forbidsConcurrentLogReads: true,
	});
});

test('a clear description or screenshot progresses directly from understanding to investigation', () => {
	const sharedUnderstanding = skill.match(/## 1\. Establish shared understanding[\s\S]*?## 2\. Investigate/u)?.[0] ?? '';
	const investigation = skill.match(/## 2\. Investigate[\s\S]*?## 3\. Take one support path/u)?.[0] ?? '';

	assert.deepStrictEqual({
		questionOnlyWhenBlocking: /ask at most one question, and only when a missing subjective fact prevents/iu.test(sharedUnderstanding),
		directTransition: /continue directly to Stage 2 in the same turn/iu.test(sharedUnderstanding),
		doesNotDemandReproduction: /do not ask the user to .*repeat the reproduction/iu.test(sharedUnderstanding),
		usesExistingEvidenceFirst: /start with the description and screenshots already supplied/iu.test(investigation),
		traceIsLastResort: /ask for trace logging .* only when the existing evidence cannot distinguish/iu.test(investigation),
	}, {
		questionOnlyWhenBlocking: true,
		directTransition: true,
		doesNotDemandReproduction: true,
		usesExistingEvidenceFirst: true,
		traceIsLastResort: true,
	});
});

test('duplicate search uses separate CLI words and complementary queries', () => {
	const search = skill.match(/### Search for matching GitHub issues[\s\S]*?### Stage 2 handoff/u)?.[0] ?? '';

	assert.deepStrictEqual({
		cliUsesSeparateWords: /Correct: gh search issues duplicate Copilot --repo microsoft\/vscode/u.test(search),
		forbidsWholeQueryQuoting: /do not quote the whole query as one argument/iu.test(search),
		cliExcludesRestQualifiers: /do not put `is:issue` or `repo:` in the `gh search issues` positional words/iu.test(search),
		restUsesSearchEndpoint: /api\.github\.com\/search\/issues\?q=<encoded-query>/u.test(search),
		restRequiresScopedQuery: /decoded, nonempty `q` must contain `is:issue repo:microsoft\/vscode`/iu.test(search),
		forbidsGenericIssuesEndpoint: /never use `https:\/\/api\.github\.com\/issues`/iu.test(search),
		usesComplementaryQueries: /two or three complementary queries/iu.test(search),
		inspectsCandidates: /inspect the title and body of the best one to three candidates/iu.test(search),
	}, {
		cliUsesSeparateWords: true,
		forbidsWholeQueryQuoting: true,
		cliExcludesRestQualifiers: true,
		restUsesSearchEndpoint: true,
		restRequiresScopedQuery: true,
		forbidsGenericIssuesEndpoint: true,
		usesComplementaryQueries: true,
		inspectsCandidates: true,
	});
});

test('investigation cannot drift into a local checkout and must end with one next step', () => {
	const investigation = skill.match(/## 2\. Investigate[\s\S]*?## 3\. Take one support path/u)?.[0] ?? '';
	const sourceFix = skill.match(/### Try a source fix[\s\S]*?## Communication/u)?.[0] ?? '';

	assert.deepStrictEqual({
		forbidsWorkspaceAndSourceReads: /do \*\*not\*\* search or read the user's workspace, local VS Code checkout, Git history, or product source/iu.test(investigation),
		openCheckoutIsNotConsent: /open checkout is not permission/iu.test(investigation),
		forbidsSourceArtifacts: /do not add source files as artifacts or references/iu.test(investigation),
		requiresCompactHandoff: /\*\*Problem:\*\*[\s\S]*\*\*Evidence:\*\*[\s\S]*\*\*Assessment:\*\*[\s\S]*\*\*Recommended next step:\*\*/u.test(investigation),
		requiresExactlyOnePath: /exactly one of the Stage 3 paths/iu.test(investigation),
		sourceRequiresExplicitChoice: /until the user explicitly chooses this path/iu.test(sourceFix),
	}, {
		forbidsWorkspaceAndSourceReads: true,
		openCheckoutIsNotConsent: true,
		forbidsSourceArtifacts: true,
		requiresCompactHandoff: true,
		requiresExactlyOnePath: true,
		sourceRequiresExplicitChoice: true,
	});
});
