/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EnvVarEnvironment, hasEnvVarReferences, IEnvVarResolverOptions, MAX_ENV_VAR_RESOLVE_LENGTH, resolveEnvVars } from '../../common/envVarResolution.js';

/**
 * Ported from the Copilot runtime's `env_var_resolution/tests.rs` so the two
 * implementations stay in sync. Keep test names aligned with the originals.
 * The `options` suite covers VS Code-only restrictions.
 */
suite('MCP - envVarResolution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function resolveAll(inputs: readonly string[], env: EnvVarEnvironment) {
		return inputs.map(input => ({ input, output: resolveEnvVars(input, env, false) }));
	}

	function expectAll(cases: readonly (readonly [input: string, expected: string])[], env: EnvVarEnvironment) {
		assert.deepStrictEqual(resolveAll(cases.map(([input]) => input), env), cases.map(([input, output]) => ({ input, output })));
	}

	test('reference presence uses the resolver parser without environment lookup', () => {
		const env = { SYNTHETIC_REFERENCE: 'resolved', SYNTHETIC_NESTED: 'nested' };
		const references = [
			'$SYNTHETIC_REFERENCE',
			'${SYNTHETIC_REFERENCE}',
			'${SYNTHETIC_REFERENCE:-default}',
			'${SYNTHETIC_MISSING:-${SYNTHETIC_NESTED}-$SYNTHETIC_REFERENCE}',
			String.raw`\$SYNTHETIC_REFERENCE`,
			'$$SYNTHETIC_REFERENCE',
		];
		const nonReferences = [
			'$',
			'$5.00',
			'$9',
			'$-',
			'${not-an-env}',
			'{"price":"$5.00"}',
		];
		assert.deepStrictEqual({
			references: references.map(value => ({ value, has: hasEnvVarReferences(value), changes: resolveEnvVars(value, env, false) !== value })),
			nonReferences: nonReferences.map(value => ({ value, has: hasEnvVarReferences(value), changes: resolveEnvVars(value, env, false) !== value })),
		}, {
			references: references.map(value => ({ value, has: true, changes: true })),
			nonReferences: nonReferences.map(value => ({ value, has: false, changes: false })),
		});
	});

	test('reference presence observes the same UTF-16 length boundary as resolution', () => {
		const suffix = '$SYNTHETIC_REFERENCE';
		const env = { SYNTHETIC_REFERENCE: 'resolved' };
		const within = 'a'.repeat(MAX_ENV_VAR_RESOLVE_LENGTH - suffix.length) + suffix;
		const over = `a${within}`;
		const unicodeOver = '\u{1f9ea}'.repeat(MAX_ENV_VAR_RESOLVE_LENGTH / 2) + suffix;
		assert.deepStrictEqual([within, over, unicodeOver].map(value => ({
			has: hasEnvVarReferences(value),
			unchanged: resolveEnvVars(value, env, false) === value,
		})), [
			{ has: true, unchanged: false },
			{ has: false, unchanged: true },
			{ has: false, unchanged: true },
		]);
	});

	test('resolves $VAR syntax', () => {
		assert.strictEqual(resolveEnvVars('$HOME/script.sh', { HOME: '/home/user' }, false), '/home/user/script.sh');
	});

	test('resolves braced syntax', () => {
		assert.strictEqual(resolveEnvVars('${HOME}/script.sh', { HOME: '/home/user' }, false), '/home/user/script.sh');
	});

	test('resolves default when var set', () => {
		assert.strictEqual(resolveEnvVars('${DIR:-/fallback}/script.sh', { DIR: '/custom' }, false), '/custom/script.sh');
	});

	test('resolves default when var missing', () => {
		assert.strictEqual(resolveEnvVars('${MISSING:-/fallback}/script.sh', {}, false), '/fallback/script.sh');
	});

	test('uses an empty value instead of the default', () => {
		assert.strictEqual(resolveEnvVars('[${EMPTY:-fallback}]', { EMPTY: '' }, false), '[]');
	});

	test('resolves nested defaults without corruption or recursive expansion', () => {
		expectAll([
			['${ACCESS_TOKEN:-${PAT:-$(keychain get PAT)}}', 'TOKEN123'],
			['${MISSING:-${PAT:-$(keychain get PAT)}}', '${PAT:-$(keychain get PAT)}'],
			['${MISSING:-${ALSO_MISSING:-${THIRD}}}', '${ALSO_MISSING:-${THIRD}}'],
		], { ACCESS_TOKEN: 'TOKEN123', PAT: 'PAT456' });
	});

	test('default extends past a closed nested expansion', () => {
		assert.strictEqual(resolveEnvVars('${ACCESS_TOKEN:-${PAT}-$THIRD}', { ACCESS_TOKEN: 'TOKEN123', PAT: 'PAT456', THIRD: 'third' }, false), 'TOKEN123');
	});

	test('unbalanced default falls back to the first close brace', () => {
		expectAll([
			['${VALUE:-${OTHER}', 'resolved'],
			['${VALUE:-$(cmd}tail}', 'resolvedtail}'],
		], { VALUE: 'resolved' });
	});

	test('unquoted nesting and escapes do not end the default early', () => {
		expectAll([
			'${ACCESS_TOKEN:-a\\}b}',
			'${ACCESS_TOKEN:-"${PAT:-fallback}"}',
			'${ACCESS_TOKEN:-$( ( true ); { printf x; } )}',
			`\${ACCESS_TOKEN:-$(printf '%s' '$(')}`,
			`\${ACCESS_TOKEN:-'\${'}`,
		].map(input => [input, 'TOKEN123'] as const), { ACCESS_TOKEN: 'TOKEN123', PAT: 'PAT456' });
	});

	test('quoted delimiters do not consume shell syntax after the reference', () => {
		expectAll([
			[`x=\${TOKEN:-$(printf '%s' '$(')}; f() { echo ok; }; f`, 'x=abc; f() { echo ok; }; f'],
			[`MODE=\${MODE:-'\${'}; helper() { :; }; helper`, 'MODE=prod; helper() { :; }; helper'],
		], { TOKEN: 'abc', MODE: 'prod' });
	});

	test('unmodelled shell syntax ends the default at the first brace', () => {
		expectAll([
			['( x=${TOKEN:-(}; : ); { printf ok; }', '( x=abc; : ); { printf ok; }'],
			['( x=${TOKEN:-$(printf x # ${\nprintf y)}; : ); { printf ok; }', '( x=abc; : ); { printf ok; }'],
			['( x=${TOKEN:-`echo }`}; : ); { printf ok; }', '( x=abc`}; : ); { printf ok; }'],
			[`\${TOKEN:-$'\\''}'x}'`, `abc'x}'`],
		], { TOKEN: 'abc' });
	});

	test('a quoted brace ends the default at the first brace', () => {
		expectAll([
			['${TOKEN:-"}"}', 'abc"}'],
			[`\${TOKEN:-'}'}`, `abc'}`],
			[`\${TOKEN:-$(printf ')' ; printf '}')}`, `abc')}`],
			[`\${TOKEN:-$(awk '{print $2}' file)}`, `abc' file)}`],
			[`\${TOKEN:-"$(printf '}')"}`, `abc')"}`],
			['${TOKEN:-$(echo "$(echo "}")")}', 'abc")")}'],
			[`\${A:-"a\\} tail" \${B:-x}}`, 'AV tail" BV}'],
			[`\${NOPE:-don't} \${ALSO_NOPE:-won't}`, `don't won't`],
			[`\${A:-$(echo don't} tail \${B:-won't)}`, 'AV tail BV'],
			[`\${A:-\${B:-don't} tail \${C:-won't}}`, 'AV tail CV}'],
		], { TOKEN: 'abc', A: 'AV', B: 'BV', C: 'CV' });
	});

	test('empty default resolves to an empty string', () => {
		assert.strictEqual(resolveEnvVars('${MISSING:-}', {}, false), '');
	});

	test('unterminated command substitution falls back to the first close brace', () => {
		assert.strictEqual(resolveEnvVars('${VALUE:-$(cmd}', { VALUE: 'resolved' }, false), 'resolved');
	});

	test('bare braces do not nest like parameter expansions', () => {
		assert.strictEqual(resolveEnvVars('${VALUE:-{"key":"value"}}', { VALUE: 'resolved' }, false), 'resolved}');
	});

	test('command substitution default ignores braces inside it', () => {
		assert.strictEqual(resolveEnvVars('${ACCESS_TOKEN:-$(echo ${INNER:-)})}', { ACCESS_TOKEN: 'TOKEN123' }, false), 'TOKEN123');
	});

	test('reference does not consume text after its close', () => {
		assert.strictEqual(resolveEnvVars('prefix ${ACCESS_TOKEN:-$(cmd)} suffix}', { ACCESS_TOKEN: 'TOKEN123' }, false), 'prefix TOKEN123 suffix}');
	});

	test('malformed braced references are left verbatim', () => {
		expectAll([
			'${VALUE',
			'${VALUE:-unterminated',
			'${VALUE-default}',
			'${1VALUE}',
			'${}',
			'$',
		].map(input => [input, input] as const), { VALUE: 'resolved' });
	});

	test('VS Code variables are not environment-variable references', () => {
		expectAll([
			['${env:X}', '${env:X}'],
			['${input:x}', '${input:x}'],
			['${secret:x}', '${secret:x}'],
			['${workspaceFolder}', '${workspaceFolder}'],
		], { env: 'nope', input: 'nope', secret: 'nope', X: 'nope' });
	});

	test('unset without default unchanged', () => {
		expectAll([
			['$MISSING/script.sh', '$MISSING/script.sh'],
			['${MISSING}/script.sh', '${MISSING}/script.sh'],
		], {});
	});

	test('resolves multiple in one string', () => {
		assert.strictEqual(resolveEnvVars('$HOME/$BIN/script.sh', { HOME: '/home/user', BIN: 'bin' }, false), '/home/user/bin/script.sh');
	});

	test('over length returned unchanged', () => {
		const long = `$HOME/${'x'.repeat(MAX_ENV_VAR_RESOLVE_LENGTH)}`;
		assert.strictEqual(resolveEnvVars(long, { HOME: '/home/user' }, false), long);
	});

	test('length cap matches JavaScript UTF-16 units', () => {
		const env = { HOME: '/home/user' };
		const tail = '\u00e9'.repeat(MAX_ENV_VAR_RESOLVE_LENGTH - 6);
		const overJsCap = `$HOME/${'\u{1f600}'.repeat((MAX_ENV_VAR_RESOLVE_LENGTH / 2) + 1)}`;
		assert.deepStrictEqual([
			resolveEnvVars(`$HOME/${tail}`, env, false),
			resolveEnvVars(overJsCap, env, false),
		], [
			`/home/user/${tail}`,
			overJsCap,
		]);
	});

	test('no env returns value unchanged', () => {
		assert.strictEqual(resolveEnvVars('$HOME/script.sh', undefined, false), '$HOME/script.sh');
	});

	test('plain strings unchanged', () => {
		expectAll([
			['/absolute/path', '/absolute/path'],
			['', ''],
		], { HOME: '/home/user' });
	});

	test('dollar followed by invalid identifier character treated as literal', () => {
		assert.strictEqual(resolveEnvVars('$1var', { '1var': 'ignored' }, false), '$1var');
	});

	test('identifier boundary stops at punctuation', () => {
		assert.strictEqual(resolveEnvVars('$ABC!def', { ABC: 'foo' }, false), 'foo!def');
	});

	test('undefined environment values are treated as unset', () => {
		assert.strictEqual(resolveEnvVars('${UNSET:-fallback} $UNSET', { UNSET: undefined }, false), 'fallback $UNSET');
	});

	test('does not resolve inherited object properties', () => {
		assert.strictEqual(resolveEnvVars('$constructor ${toString}', {}, false), '$constructor ${toString}');
	});

	test('case-insensitive lookup matches mixed-case keys', () => {
		const env = { Path: '/windows/path' };
		assert.deepStrictEqual([
			resolveEnvVars('$PATH', env, false),
			resolveEnvVars('$PATH', env, true),
			resolveEnvVars('${path}', env, true),
		], [
			'$PATH',
			'/windows/path',
			'/windows/path',
		]);
	});

	suite('options', () => {
		const options: IEnvVarResolverOptions = { bareReferences: false };
		const env = { A: 'a' };

		test('can leave bare references literal', () => {
			const values = ['$A', '${A}', '$${A}', '${MISSING:-$A}'];
			assert.deepStrictEqual(values.map(value => ({
				resolved: resolveEnvVars(value, env, false, options),
				has: hasEnvVarReferences(value, options),
			})), [
				{ resolved: '$A', has: false },
				{ resolved: 'a', has: true },
				{ resolved: '$a', has: true },
				{ resolved: '$A', has: true },
			]);
		});
	});
});
