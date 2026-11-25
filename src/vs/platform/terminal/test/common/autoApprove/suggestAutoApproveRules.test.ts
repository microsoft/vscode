/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { suggestAutoApproveRuleKeys } from '../../../common/autoApprove/suggestAutoApproveRules.js';

suite('suggestAutoApproveRuleKeys', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('suggests rule keys and exact command lines without duplicate or overly broad rules', () => {
		const cases = [
			{ commandLine: 'grep foo', unapprovedSubCommands: ['grep foo'] },
			{ commandLine: 'grep', unapprovedSubCommands: ['grep'] },
			{ commandLine: 'git -C x log --oneline', unapprovedSubCommands: ['git -C x log --oneline'] },
			{ commandLine: 'git log --oneline', unapprovedSubCommands: ['git log --oneline'] },
			{ commandLine: 'npm run build -- --watch', unapprovedSubCommands: ['npm run build -- --watch'] },
			{ commandLine: 'npm run', unapprovedSubCommands: ['npm run'] },
			{ commandLine: 'npm', unapprovedSubCommands: ['npm'] },
			{ commandLine: 'pnpm run lint src/a.ts', unapprovedSubCommands: ['pnpm run lint src/a.ts'] },
			{ commandLine: 'pnpm exec eslint src/a.ts', unapprovedSubCommands: ['pnpm exec eslint src/a.ts'] },
			{ commandLine: 'pnpm eslint src/a.ts', unapprovedSubCommands: ['pnpm eslint src/a.ts'] },
			{ commandLine: 'pnpm', unapprovedSubCommands: ['pnpm'] },
			{ commandLine: 'bun run test src/a.ts', unapprovedSubCommands: ['bun run test src/a.ts'] },
			{ commandLine: 'bunx eslint src/a.ts', unapprovedSubCommands: ['bunx eslint src/a.ts'] },
			{ commandLine: 'python x.py', unapprovedSubCommands: ['python x.py'] },
			{ commandLine: 'sudo rm', unapprovedSubCommands: ['sudo rm'] },
			{ commandLine: 'grep foo && git log && grep bar && git log --oneline', unapprovedSubCommands: ['grep foo', 'git log', 'grep bar', 'git log --oneline'] },
			{ commandLine: 'grep foo', unapprovedSubCommands: [] },
			{ commandLine: '', unapprovedSubCommands: [] },
		] as const;

		assert.deepStrictEqual(cases.map(({ commandLine, unapprovedSubCommands }) => suggestAutoApproveRuleKeys(commandLine, unapprovedSubCommands)), [
			{ subCommandKeys: ['grep'], offerExactCommandLine: true },
			{ subCommandKeys: ['grep'], offerExactCommandLine: false },
			{ subCommandKeys: ['git -C x'], offerExactCommandLine: true },
			{ subCommandKeys: ['git log'], offerExactCommandLine: true },
			{ subCommandKeys: ['npm run build'], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: false },
			{ subCommandKeys: [], offerExactCommandLine: false },
			{ subCommandKeys: ['pnpm run lint'], offerExactCommandLine: true },
			{ subCommandKeys: ['pnpm exec eslint'], offerExactCommandLine: true },
			{ subCommandKeys: ['pnpm eslint'], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: false },
			{ subCommandKeys: ['bun run test'], offerExactCommandLine: true },
			{ subCommandKeys: ['bunx eslint'], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: true },
			{ subCommandKeys: ['grep', 'git log'], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: true },
			{ subCommandKeys: [], offerExactCommandLine: false },
		]);
	});
});
