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

	const skill = readFileSync(FileAccess.asFileUri('vs/workbench/contrib/chat/common/promptSyntax/builtinSkills/issue-wizard/SKILL.md').fsPath, 'utf8');

	test('uses dbgjs as bounded Stage 2 evidence without reading the checkout', () => {
		const investigation = skill.match(/## 2\. Investigate with runtime evidence[\s\S]*?## 3\. Take one support path/u)?.[0] ?? '';
		const debugging = investigation.match(/### Runtime debugging with dbgjs[\s\S]*?### Search for matching GitHub issues/u)?.[0] ?? '';

		assert.deepStrictEqual({
			runningInstanceUsesDbgjsBeforeIssueSearch: /asks to investigate the running instance[\s\S]*attempt the bounded dbgjs investigation before searching GitHub issues/iu.test(debugging),
			duplicatesDistinguishDomFromBackingState: /duplicate or missing UI entries[\s\S]*repeated DOM renderings from distinct backing values or registrations/iu.test(debugging),
			forbidsUiAutomationSubstitutes: /do not use computer-use, browser, integrated-browser, or generic UI-automation tools[\s\S]*use only `dbgjs`/iu.test(debugging),
			separatesRuntimeSetupFromGitHubSearch: /do not combine the dbgjs availability or setup command with GitHub search/iu.test(debugging),
			requiresSpecificQuestion: /form a specific runtime question/iu.test(debugging),
			choosesLeastIntrusiveTechnique: /choose the least intrusive technique/iu.test(debugging),
			doesNotInstallMerelyBecauseAvailable: /do not install or attach merely because the debugger is available/iu.test(debugging),
			usesApprovedGlobalInstall: /npm install --global @hediet\/dbgjs@next[\s\S]*terminal approval card is the consent surface/iu.test(debugging),
			isolatesCaseState: /DBGJS_SERVICE_STATE[\s\S]*never use the user's default dbgjs state/iu.test(debugging),
			usesPassiveDiscovery: /process list --root vscode --no-cmd-line/iu.test(debugging),
			scopesLoadedSourcesByContextOnly: /loaded-source commands are context-scoped and reject `--target`/iu.test(debugging),
			forbidsForce: /never use `--force`/iu.test(debugging),
			forbidsCheckoutReads: /never use shell file-search or file-reading commands to supplement `dbgjs`/iu.test(debugging),
		}, {
			runningInstanceUsesDbgjsBeforeIssueSearch: true,
			duplicatesDistinguishDomFromBackingState: true,
			forbidsUiAutomationSubstitutes: true,
			separatesRuntimeSetupFromGitHubSearch: true,
			requiresSpecificQuestion: true,
			choosesLeastIntrusiveTechnique: true,
			doesNotInstallMerelyBecauseAvailable: true,
			usesApprovedGlobalInstall: true,
			isolatesCaseState: true,
			usesPassiveDiscovery: true,
			scopesLoadedSourcesByContextOnly: true,
			forbidsForce: true,
			forbidsCheckoutReads: true,
		});
	});

	test('selects debugger techniques by symptom and protects the active conversation', () => {
		const debugging = skill.match(/### Runtime debugging with dbgjs[\s\S]*?### Search for matching GitHub issues/u)?.[0] ?? '';

		assert.deepStrictEqual({
			domAndSourceMaps: /renderer DOM[\s\S]*source grep[\s\S]*source map/iu.test(debugging),
			boundedRemoteObjects: /prefer `value --object-id`[\s\S]*read-only `target cdp Runtime\.getProperties`/iu.test(debugging),
			sideEffectSafeValues: /prefer `value <expression>` because it rejects side effects by default/iu.test(debugging),
			coverage: /focused coverage capture/iu.test(debugging),
			breakpointsAndFailSafeResume: /breakpoint or logpoint[\s\S]*fail-safe cleanup/iu.test(debugging),
			cpuProfile: /short CPU profile/iu.test(debugging),
			heapInvestigation: /heap capture[\s\S]*heap retainer-path[\s\S]*heap diff/iu.test(debugging),
			protectsOwningProcesses: /never pause, step, set breakpoints in, or take a heap snapshot of the renderer or agent-host process that must keep the active Issue Wizard conversation responsive/iu.test(debugging),
			boundedHandoff: /summarize only the minimum runtime evidence needed for the handoff/iu.test(debugging),
			cleansUp: /disconnect or release the case connection, delete the explicit context, stop the isolated dbgjs service/iu.test(debugging),
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

	test('keeps provider-native question tool names out of the prompt', () => {
		assert.ok(!/(?:ask_user|AskUserQuestion|request_user_input)/u.test(skill));
	});
});
