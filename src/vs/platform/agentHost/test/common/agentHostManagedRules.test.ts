/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildManagedFamilyRule, buildManagedRule, ManagedRuleFamily } from '../../common/agentHostManagedRules.js';

suite('AgentHostManagedRules', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds family rules that match every request in the family', () => {
		assert.strictEqual(buildManagedFamilyRule(ManagedRuleFamily.Shell), 'Shell');
		assert.strictEqual(buildManagedFamilyRule(ManagedRuleFamily.Domain), 'Domain');
	});

	test('builds shell rules including the command-boundary wildcard form', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, 'npm run build'), 'Shell(npm run build)');
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, 'git *'), 'Shell(git *)');
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, '*'), 'Shell(*)');
	});

	test('rejects a wildcard shell rule with no command prefix', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, ' *'), undefined);
	});

	test('rejects arguments that would truncate the rule parse', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, 'echo (hi)'), undefined);
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Read, 'src/**/*)'), undefined);
	});

	test('builds path rules and normalizes windows separators', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Write, '**/*.json'), 'Write(**/*.json)');
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Read, 'src\\**'), 'Read(src/**)');
		assert.strictEqual(
			buildManagedRule(ManagedRuleFamily.Write, '**/*.{csproj,props}'),
			'Write(**/*.{csproj,props})',
		);
	});

	test('rejects path patterns the runtime glob engine cannot compile', () => {
		// Negation is legal in VS Code globs but has no equivalent in the runtime,
		// where it would fail validation and reject the whole document.
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Write, '!**/*.json'), undefined);
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Write, '**/*.{a,b'), undefined);
	});

	test('builds domain rules for hosts and subdomain wildcards', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, 'example.com'), 'Domain(example.com)');
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, '*.example.com'), 'Domain(*.example.com)');
	});

	test('rejects a bare wildcard domain in favor of the family rule', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, '*'), undefined);
	});

	test('rejects domains the runtime url normalizer refuses', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, '$(curl evil.com)'), undefined);
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, 'no//scheme'), undefined);
	});

	test('rejects empty and whitespace-only arguments', () => {
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Shell, ''), undefined);
		assert.strictEqual(buildManagedRule(ManagedRuleFamily.Domain, '   '), undefined);
	});
});
