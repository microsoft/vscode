/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Issue Wizard Built-in Skill', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const issueWizardSkill = readFileSync(FileAccess.asFileUri('vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md').fsPath, 'utf8');
	const dbgjsSkill = readFileSync(FileAccess.asFileUri('vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/dbgjs-runtime-debugging/SKILL.md').fsPath, 'utf8');

	test('delegates runtime investigation to the bundled dbgjs skill', () => {
		const investigation = issueWizardSkill.match(/## 2\. Investigate with runtime evidence[\s\S]*?## 3\. Take one support path/u)?.[0] ?? '';
		const routing = investigation.match(/### Runtime debugging with dbgjs[\s\S]*?### Search for matching GitHub issues/u)?.[0] ?? '';

		assert.deepStrictEqual({
			invokesBeforeIssueSearch: /invoke the bundled \[dbgjs-runtime-debugging\][\s\S]*before searching GitHub issues/iu.test(routing),
			passesProblemAndQuestion: /Stage 1 problem brief[\s\S]*one precise runtime question/iu.test(routing),
			forbidsDirectUiAutomation: /do not inspect or control the VS Code DOM with computer-use, browser, integrated-browser, or generic UI-automation tools yourself/iu.test(routing),
			separatesSetupFromIssueSearch: /do not combine debugger setup with GitHub search/iu.test(routing),
			distinguishesDuplicateBackingState: /duplicate or missing UI entries[\s\S]*repeated DOM renderings from distinct backing values or registrations/iu.test(routing),
			preservesUnavailableDebuggerLimitation: /dbgjs is unavailable, declined, or cannot attach safely[\s\S]*preserve that limitation/iu.test(routing),
		}, {
			invokesBeforeIssueSearch: true,
			passesProblemAndQuestion: true,
			forbidsDirectUiAutomation: true,
			separatesSetupFromIssueSearch: true,
			distinguishesDuplicateBackingState: true,
			preservesUnavailableDebuggerLimitation: true,
		});
	});

	test('keeps dbgjs investigation bounded and isolated', () => {
		assert.deepStrictEqual({
			forbidsUiAutomationSubstitutes: /use only `dbgjs`[\s\S]*do not substitute computer-use, browser, integrated-browser, generic UI automation/iu.test(dbgjsSkill),
			forbidsCheckoutReads: /do not search the workspace, a local checkout, Git history, or source files on disk/iu.test(dbgjsSkill),
			requiresSpecificQuestion: /one specific runtime question/iu.test(dbgjsSkill),
			choosesLeastIntrusiveTechnique: /least intrusive evidence/iu.test(dbgjsSkill),
			doesNotInstallMerelyBecauseAvailable: /do not attach merely because the debugger is available/iu.test(dbgjsSkill),
			usesApprovedGlobalInstall: /npm install --global @hediet\/dbgjs@next[\s\S]*terminal approval card is the consent surface/iu.test(dbgjsSkill),
			isolatesCaseState: /DBGJS_SERVICE_STATE[\s\S]*never use the user's default dbgjs state/iu.test(dbgjsSkill),
			usesPassiveDiscovery: /process list --root vscode --no-cmd-line/iu.test(dbgjsSkill),
			scopesLoadedSourcesByContextOnly: /loaded-source commands are context-scoped and reject `--target`/iu.test(dbgjsSkill),
			forbidsForce: /never use `--force`/iu.test(dbgjsSkill),
			returnsEvidenceWithoutChoosingPath: /do not search GitHub, edit code, or choose the caller's next support or implementation path/iu.test(dbgjsSkill),
		}, {
			forbidsUiAutomationSubstitutes: true,
			forbidsCheckoutReads: true,
			requiresSpecificQuestion: true,
			choosesLeastIntrusiveTechnique: true,
			doesNotInstallMerelyBecauseAvailable: true,
			usesApprovedGlobalInstall: true,
			isolatesCaseState: true,
			usesPassiveDiscovery: true,
			scopesLoadedSourcesByContextOnly: true,
			forbidsForce: true,
			returnsEvidenceWithoutChoosingPath: true,
		});
	});

	test('selects debugger techniques by symptom and protects the caller', () => {
		assert.deepStrictEqual({
			domAndSourceMaps: /renderer DOM[\s\S]*source grep[\s\S]*source map/iu.test(dbgjsSkill),
			boundedRemoteObjects: /prefer `value --object-id`[\s\S]*read-only `target cdp Runtime\.getProperties`/iu.test(dbgjsSkill),
			sideEffectSafeValues: /prefer `value <expression>` because it rejects side effects by default/iu.test(dbgjsSkill),
			coverage: /focused coverage capture/iu.test(dbgjsSkill),
			breakpointsAndFailSafeResume: /breakpoint or logpoint[\s\S]*fail-safe cleanup/iu.test(dbgjsSkill),
			cpuProfile: /short CPU profile/iu.test(dbgjsSkill),
			heapInvestigation: /heap capture[\s\S]*heap retainer-path[\s\S]*heap diff/iu.test(dbgjsSkill),
			protectsOwningProcesses: /never pause, step, set breakpoints in, or take a heap snapshot of a process that must keep the calling conversation or control plane responsive/iu.test(dbgjsSkill),
			boundedHandoff: /return only the minimum runtime evidence needed to answer the question/iu.test(dbgjsSkill),
			cleansUp: /disconnect or release the case connection, delete the explicit context, stop the isolated dbgjs service/iu.test(dbgjsSkill),
		}, {
			domAndSourceMaps: true,
			boundedRemoteObjects: true,
			sideEffectSafeValues: true,
			coverage: true,
			breakpointsAndFailSafeResume: true,
			cpuProfile: true,
			heapInvestigation: true,
			protectsOwningProcesses: true,
			boundedHandoff: true,
			cleansUp: true,
		});
	});

	test('keeps provider-native question tool names out of the prompts', () => {
		assert.ok(!/(?:ask_user|AskUserQuestion|request_user_input)/u.test(`${issueWizardSkill}\n${dbgjsSkill}`));
	});
});
