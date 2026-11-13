/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { ContextSizeConfigKey, createContextSizeConfigSchemaPropertyFromLimits } from '../../common/agentModelConfiguration.js';
import { IModelRouter, IModelRouterDiagnostic, matchModelReference, ModelReferenceMatch, MODEL_ROUTER_MAX_DECISION_TEXT_BYTES, MODEL_ROUTER_MAX_FILE_BYTES, ModelRouterDiagnosticSeverity, modelRouterDecisionTextBytes, modelRouterNameFromFileName, modelRouterNameFromModelId, parseModelRouter, resolveModelRouter } from '../../common/modelRouter.js';
import { ReasoningEffortConfigKey } from '../../common/reasoningEffort.js';
import { PolicyState } from '../../common/state/protocol/channels-root/state.js';

const valid = [
	'version: 1',
	'description: Haiku by default, Opus for planning.',
	'guidance: |',
	'  Prefer the cheapest model that can do the job.',
	'routes:',
	'  - model: claude-haiku-5.5',
	'    when: Lookups, explanations, small edits.',
	'    examples:',
	'      - where is the code for hydrafusion?',
	'  - model: [claude-opus-5.5, claude-opus-5]  # fallback',
	'    when: Planning, design, multi-file work.',
	'    effort: high',
	'',
].join('\n');

function errors(content: string, fileName = 'daily-driver.model-router.yaml'): string[] {
	return parseModelRouter(content, fileName).diagnostics.filter(d => d.severity === ModelRouterDiagnosticSeverity.Error).map(d => d.message);
}

function messages(diagnostics: readonly IModelRouterDiagnostic[]): string[] {
	return diagnostics.map(d => d.message);
}

function withRoutes(routes: string): string {
	return `version: 1\ndescription: Test.\nroutes:\n${routes}\n`;
}

function modelId(match: ModelReferenceMatch | undefined): string | undefined {
	return match?.kind === 'model' ? match.model.id : undefined;
}

const twoRoutes = '  - model: a\n    when: A.\n  - model: b\n    when: B.';

suite('modelRouter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseModelRouter', () => {
		test('parses a valid router, taking the name from the file name', () => {
			const result = parseModelRouter(valid, 'daily-driver.model-router.yaml');
			assert.deepStrictEqual(result.diagnostics, []);
			assert.deepStrictEqual(result.router, {
				name: 'daily-driver',
				description: 'Haiku by default, Opus for planning.',
				effort: 'auto',
				switching: 'first-turn',
				guidance: 'Prefer the cheapest model that can do the job.',
				routes: [
					{ models: ['claude-haiku-5.5'], when: 'Lookups, explanations, small edits.', examples: ['where is the code for hydrafusion?'] },
					{ models: ['claude-opus-5.5', 'claude-opus-5'], when: 'Planning, design, multi-file work.', examples: [], effort: 'high' },
				],
			});
		});

		test('reads `display-name` on one line, and `context-size` for the router and for a route', () => {
			const parsed = parseModelRouter('version: 1\ndisplay-name: |\n  Daily\n  Driver\ndescription: Test.\ncontext-size: long\nroutes:\n  - model: a\n    when: A.\n    context-size: default\n  - model: b\n    when: B.\n', 'r.model-router.yaml');
			assert.deepStrictEqual({
				displayName: parsed.router?.displayName,
				router: parsed.router?.contextSize,
				routes: parsed.router?.routes.map(route => route.contextSize),
				diagnostics: parsed.diagnostics,
				invalid: errors(`version: 1\ndisplay-name: ${'x'.repeat(65)}\ndescription: Test.\nroutes:\n  - model: a\n    when: A.\n    context-size: huge\n  - model: b\n    when: B.\n`),
			}, {
				displayName: 'Daily Driver',
				router: 'long',
				routes: ['default', undefined],
				diagnostics: [],
				invalid: ['The display name is longer than 64 characters.', 'Route 1\'s `context-size` is `default` or `long`.'],
			});
		});

		test('parses a route\'s name and guidance, and lets named routes share a model', () => {
			const parsed = parseModelRouter(withRoutes([
				'  - name: feature',
				'    model: [opus, sonnet]',
				'    when: Building.',
				'    effort: high',
				'    guidance: Plan first.',
				'  - name: bug-fix',
				'    model: opus',
				'    when: Fixing.',
				'  - model: opus',
				'    when: Anything else.',
			].join('\n')), 'workday.model-router.yaml');
			assert.deepStrictEqual({ routes: parsed.router?.routes, guidance: parsed.router?.guidance, diagnostics: parsed.diagnostics }, {
				routes: [
					{ models: ['opus', 'sonnet'], when: 'Building.', examples: [], effort: 'high', name: 'feature', mainAgentGuidance: 'Plan first.' },
					{ models: ['opus'], when: 'Fixing.', examples: [], name: 'bug-fix' },
					{ models: ['opus'], when: 'Anything else.', examples: [] },
				],
				// A route's guidance is for the chat's main agent, never for the routing decision.
				guidance: '',
				diagnostics: [],
			});
		});

		test('checks names and guidance', () => {
			const check = (text: string) => messages(parseModelRouter(`version: 1\ndescription: Test.\n${text}\n`, 'workday.model-router.yaml').diagnostics);
			const guided = 'routes:\n  - model: a\n    when: A.\n    guidance: Plan first.';
			assert.deepStrictEqual({
				oneGuidedRoute: check(guided),
				oneRoute: check('routes:\n  - model: a\n    when: A.'),
				sameName: check('routes:\n  - name: one\n    model: a\n    when: A.\n  - name: one\n    model: b\n    when: B.'),
				sameModel: check('routes:\n  - model: a\n    when: A.\n  - model: a\n    when: B.\n    effort: low'),
				badName: check('routes:\n  - name: Bug_Fix\n    model: a\n    when: A.\n  - model: b\n    when: B.'),
				switching: check(`switching: auto\n${guided}`),
				longGuidance: check(`${guided} ${'x'.repeat(4000)}`),
				// The preview format, which this build no longer reads.
				playbooks: check('playbooks:\n  one:\n    when: A.\n    main: a'),
				roles: check(`roles:\n  reviewer:\n    description: Reviews.\n${guided}`),
			}, {
				oneGuidedRoute: [],
				oneRoute: ['A router has 2 to 10 routes; this one has 1.'],
				sameName: ['The name `one` is already route 1\'s; each name belongs to one route.'],
				sameModel: ['`a` is already in route 1; each model belongs to one route, unless the routes have a `name`.'],
				badName: ['Route 1\'s `name` is lowercase letters, digits and single hyphens, like `bug-fix`.'],
				switching: ['A route\'s `guidance` is given to a chat when it starts and kept for that chat, so `switching: auto` can\'t be used with it.'],
				longGuidance: ['Route 1\'s `guidance` is too long: at most 4000 characters.'],
				playbooks: ['Write `playbooks` as `routes`: a list where each route has `model` and `when`, and can have a `name` and `guidance`.'],
				roles: ['`roles` are no longer read. To have a custom agent used, name it in a route\'s `guidance`.'],
			});
		});

		test('reads a file saved with a byte order mark', () => {
			assert.deepStrictEqual(parseModelRouter(`\uFEFF${valid}`, 'daily-driver.model-router.yaml'), parseModelRouter(valid, 'daily-driver.model-router.yaml'));
		});

		test('reads names from .yml files and ids', () => {
			assert.strictEqual(modelRouterNameFromFileName('fast.model-router.yml'), 'fast');
			assert.strictEqual(modelRouterNameFromFileName('fast.yaml'), undefined);
			assert.strictEqual(modelRouterNameFromModelId('model-router:fast'), 'fast');
			assert.strictEqual(modelRouterNameFromModelId('claude-opus-5'), undefined);
		});

		test('checks the schema', () => {
			assert.deepStrictEqual(errors(valid.replace('version: 1\n', '')), ['Add `version: 1`.']);
			assert.deepStrictEqual(errors(valid.replace('version: 1', 'version: 2')), ['Unsupported version `2`. This version of VS Code reads version 1.']);
			assert.deepStrictEqual(errors(valid, 'Daily Driver.model-router.yaml'), ['The name must be lowercase letters, digits and single hyphens, like `daily-driver`.']);
			assert.deepStrictEqual(errors(valid.replace(/^description: .*\n/m, '')), ['Add a `description`; it is shown in the model picker.']);
			assert.deepStrictEqual(errors(withRoutes('  - model: a\n    when: A.')), ['A router has 2 to 10 routes; this one has 1.']);
			assert.deepStrictEqual(errors(withRoutes(`${twoRoutes}\n  - model: [c, A]\n    when: C.`)), ['`A` is already in route 1; each model belongs to one route, unless the routes have a `name`.']);
			assert.deepStrictEqual(errors(withRoutes('  - model: a\n  - model: b\n    when: B.')), ['Route 1 needs `when`: when to use this model.']);
			assert.deepStrictEqual(errors(withRoutes('  - model: a b\n    when: A.\n  - model: b\n    when: B.')), ['Route 1 needs `model`: a model id like `claude-haiku-5.5` or `anthropic/claude-haiku-4-5`, or a list of them in preference order.']);
			assert.deepStrictEqual(errors(`effort: auto\n${withRoutes('  - model: a\n    when: A.\n    effort: auto\n  - model: b\n    when: B.')}`), ['Route 1\'s `effort` is `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra`.']);
			assert.deepStrictEqual(errors(`switching: sometimes\n${withRoutes(twoRoutes)}`), ['`switching` is `auto` or `first-turn`.']);
		});

		test('warns about unknown and reserved keys but still loads', () => {
			const result = parseModelRouter(`subagents: []\ncolor: blue\nswitching: mid-turn\n${withRoutes('  - model: a\n    when: A.\n    cost: 1\n  - model: b\n    when: B.')}`, 'r.model-router.yaml');
			assert.ok(result.router);
			assert.deepStrictEqual(messages(result.diagnostics), [
				'`subagents` is reserved for a later version and is ignored.',
				'Unknown key `color` is ignored.',
				'`switching: mid-turn` is reserved for a later version; this router routes on the first turn only.',
				'Unknown key `cost` in route 1 is ignored.',
			]);
		});

		suite('rejects YAML the shared parser accepts silently', () => {
			test('an unterminated quote at the end of the file', () => {
				assert.deepStrictEqual(errors(`${withRoutes(twoRoutes)}guidance: "unfinished`), ['This quoted value is missing its closing quote.']);
			});
			test('an unknown escape', () => {
				assert.deepStrictEqual(errors(`guidance: "bad\\q"\n${withRoutes(twoRoutes)}`), ['`\\q` is not a YAML escape; write `\\\\` for a backslash.']);
			});
			test('malformed and out-of-range hex escapes', () => {
				assert.deepStrictEqual(errors(`guidance: "\\x4"\n${withRoutes(twoRoutes)}`), ['`\\x` needs 2 hex digits naming a valid character.']);
				assert.deepStrictEqual(errors(`guidance: "\\uD800"\n${withRoutes(twoRoutes)}`), ['`\\u` needs 4 hex digits naming a valid character.']);
				assert.strictEqual(errors(`guidance: "\\U00110000"\n${withRoutes(twoRoutes)}`).length, 1);
			});
			test('valid escapes are fine', () => {
				assert.strictEqual(parseModelRouter(`guidance: "tab\\there \\u00e9 \\\\ \\"q\\" it''s"\n${withRoutes(twoRoutes)}`, 'r.model-router.yaml').router?.guidance, 'tab\there é \\ "q" it\'\'s');
				assert.strictEqual(parseModelRouter(`guidance: 'it''s'\n${withRoutes(twoRoutes)}`, 'r.model-router.yaml').router?.guidance, 'it\'s');
			});
			test('flow maps', () => {
				assert.deepStrictEqual(errors(withRoutes('  - { model: a, when: A. }\n  - model: b\n    when: B.')), ['`{ … }` maps are not supported; put each key on its own line.']);
			});
			test('flow lists without commas', () => {
				assert.deepStrictEqual(errors(withRoutes('  - model: [a c]\n    when: A.\n  - model: b\n    when: B.')).length > 0, true);
				assert.deepStrictEqual(errors(withRoutes('  - model: [a, "c" "d"]\n    when: A.\n  - model: b\n    when: B.')), ['Separate the values in a `[ … ]` list with commas.']);
			});
			test('duplicate keys at any depth', () => {
				assert.strictEqual(errors(`version: 1\n${withRoutes(twoRoutes)}`).length, 1);
				assert.strictEqual(errors(withRoutes('  - model: a\n    when: A.\n    when: B.\n  - model: b\n    when: B.')).length, 1);
			});
			test('content the parser stopped before', () => {
				assert.deepStrictEqual(errors(`${withRoutes(twoRoutes)}  oops: 1\n`).length > 0, true);
				assert.deepStrictEqual(errors(`${withRoutes(twoRoutes)}\n# a trailing comment\n`), []);
			});
			test('a document that is not a map', () => {
				assert.deepStrictEqual(errors('- a\n- b\n'), ['A model router is a YAML map with `version`, `description` and `routes`.']);
			});
		});

		suite('sizes', () => {
			test('rejects files over the limit', () => {
				const big = `${withRoutes(twoRoutes)}# ${'x'.repeat(MODEL_ROUTER_MAX_FILE_BYTES)}\n`;
				assert.deepStrictEqual(errors(big), ['A model router file is at most 32 KiB.']);
			});
			test('measures decision text after JSON escaping', () => {
				// Each control character is one byte in the file and six once escaped.
				const control = '\u0001'.repeat(12 * 1024);
				const content = `guidance: |\n  ${control}\n${withRoutes(twoRoutes)}`;
				assert.ok(content.length < MODEL_ROUTER_MAX_FILE_BYTES);
				assert.ok(modelRouterDecisionTextBytes(control, []) > MODEL_ROUTER_MAX_DECISION_TEXT_BYTES);
				assert.deepStrictEqual(errors(content), ['The guidance, `when` and examples together are too long: at most 64 KiB is sent with each decision.']);
			});
		});
	});

	suite('resolveModelRouter', () => {
		function model(id: string, options: { byok?: string; efforts?: string[]; policy?: PolicyState; retiring?: string } = {}): IAgentModelInfo {
			const meta = { ...createAgentModelByokMeta(options.byok), ...(options.retiring ? { warningText: { model_pending_deprecation: options.retiring } } : {}) };
			return {
				provider: 'copilot',
				id,
				name: id,
				supportsVision: true,
				...(options.efforts ? { configSchema: { type: 'object', properties: { [ReasoningEffortConfigKey]: { type: 'string', title: 'Effort', enum: options.efforts } } } } : {}),
				...(options.policy ? { policyState: options.policy } : {}),
				...(Object.keys(meta).length ? { _meta: meta } : {}),
			};
		}

		function router(routes: IModelRouter['routes'], effort: IModelRouter['effort'] = 'auto'): IModelRouter {
			return { name: 'r', description: 'R.', effort, switching: 'auto', guidance: '', routes };
		}

		test('matches Copilot ids with dots or dashes, and BYOK models by vendor and id', () => {
			const models = [model('claude-opus-4-8'), model('byok-1', { byok: 'anthropic/Work/claude-haiku-4-5' }), model('byok-2', { byok: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' })];
			assert.strictEqual(modelId(matchModelReference(models, 'claude-opus-4.8')), 'claude-opus-4-8');
			assert.strictEqual(modelId(matchModelReference(models, 'anthropic/claude-haiku-4.5')), 'byok-1');
			assert.strictEqual(modelId(matchModelReference(models, 'openrouter/aion-labs/aion-3.0')), 'byok-2');
			assert.strictEqual(matchModelReference(models, 'anthropic/claude-opus-4-8'), undefined);
			assert.strictEqual(matchModelReference(models, 'claude-haiku-4-5'), undefined);
		});

		test('reports a BYOK id that matches more than one model, and the full id picks one', () => {
			const models = [model('w', { byok: 'anthropic/Work/claude-haiku-4-5' }), model('h', { byok: 'anthropic/Home/claude-haiku-4-5' }), model('b')];
			assert.strictEqual(matchModelReference(models, 'anthropic/claude-haiku-4-5')?.kind, 'ambiguous');
			assert.strictEqual(modelId(matchModelReference(models, 'anthropic/Home/claude-haiku-4-5')), 'h');
			const result = resolveModelRouter(router([{ models: ['anthropic/claude-haiku-4-5'], when: 'A.', examples: [] }, { models: ['b'], when: 'B.', examples: [] }]), models);
			assert.deepStrictEqual(result.routes.map(r => r.model.id), ['b']);
			assert.ok(result.diagnostics[0].message.includes('`anthropic/Work/claude-haiku-4-5`, `anthropic/Home/claude-haiku-4-5`'));
		});

		test('uses fallbacks, skips policy-disabled and missing models, and never picks routing models', () => {
			const models = [model('auto'), model('model-router:other'), model('opus-5.5', { policy: PolicyState.Disabled }), model('opus-5'), model('sonnet')];
			const result = resolveModelRouter(router([
				{ models: ['opus-5.5', 'opus-5'], when: 'A.', examples: [] },
				{ models: ['gone'], when: 'B.', examples: [] },
				{ models: ['auto'], when: 'C.', examples: [] },
				{ models: ['sonnet'], when: 'D.', examples: [] },
			]), models);
			assert.deepStrictEqual(result.routes.map(r => [r.model.id, r.reference]), [['opus-5', 'opus-5'], ['sonnet', 'sonnet']]);
			assert.deepStrictEqual(messages(result.diagnostics), [
				'Route 1: opus-5.5 is disabled by policy.',
				'Route 1 uses `opus-5` because `opus-5.5` is not available.',
				'Route 2 (gone) is skipped: none of its models are available on this account.',
				'Route 3 (auto) is skipped: none of its models are available on this account.',
			]);
		});

		test('checks the effective fixed effort against the model', () => {
			const models = [model('a', { efforts: ['low', 'medium', 'high'] }), model('b', { efforts: ['low'] }), model('c')];
			const result = resolveModelRouter(router([
				{ models: ['a'], when: 'A.', examples: [] },
				{ models: ['b'], when: 'B.', examples: [] },
				{ models: ['c'], when: 'C.', examples: [], effort: 'low' },
			], 'high'), models);
			assert.deepStrictEqual(result.routes.map(r => r.effort), ['high', undefined, undefined]);
			assert.deepStrictEqual(messages(result.diagnostics), [
				'Route 2: b doesn\'t support effort `high`; it supports `low`.',
				'Route 3: c has no reasoning effort setting, so effort `low` is ignored.',
			]);
		});

		test('warns about retiring models and when too few routes are left', () => {
			const result = resolveModelRouter(router([{ models: ['a'], when: 'A.', examples: [] }, { models: ['gone'], when: 'B.', examples: [] }]), [model('a', { retiring: 'Retires on Dec 1.' })]);
			assert.deepStrictEqual(result.routes[0].retiring, 'Retires on Dec 1.');
			assert.deepStrictEqual(messages(result.diagnostics), [
				'Route 1: a is being retired. Retires on Dec 1. Add a newer model to its `model` list.',
				'Route 2 (gone) is skipped: none of its models are available on this account.',
				'Only 1 of this router\'s models is available, so there is nothing to route between.',
			]);
		});

		test('resolves named routes by name, so two can run on the same model', () => {
			const named = router([
				{ models: ['a'], when: 'A.', examples: [], name: 'feature' },
				{ models: ['gone', 'a'], when: 'B.', examples: [], name: 'bug-fix' },
				{ models: ['gone'], when: 'C.', examples: [], name: 'quick' },
				{ models: ['a'], when: 'D.', examples: [] },
				// A pick of `a` could mean the route above or this one.
				{ models: ['b'], when: 'E.', examples: [], name: 'a' },
			]);
			const result = resolveModelRouter(named, [model('a'), model('b')]);
			assert.deepStrictEqual({ routes: result.routes.map(resolved => [resolved.route.name, resolved.model.id]), diagnostics: messages(result.diagnostics) }, {
				routes: [['feature', 'a'], ['bug-fix', 'a'], [undefined, 'a']],
				diagnostics: [
					'Route `bug-fix` uses `a` because `gone` is not available.',
					'Route `quick` (gone) is skipped: none of its models are available on this account.',
					'Route `a` is skipped: `a` is the name of one route and the model of another.',
				],
			});
		});

		test('applies `context-size` only to models that offer a larger window', () => {
			const withLong = (id: string): IAgentModelInfo => ({ ...model(id), configSchema: { type: 'object', properties: { [ContextSizeConfigKey]: createContextSizeConfigSchemaPropertyFromLimits(200_000, 1_000_000)! } } });
			const route = (id: string, contextSize?: 'default' | 'long') => ({ models: [id], when: 'W.', examples: [], ...(contextSize ? { contextSize } : {}) });
			const resolve = (candidate: IModelRouter, models: IAgentModelInfo[]) => {
				const result = resolveModelRouter(candidate, models);
				return { sizes: result.routes.map(resolved => resolved.contextSize), diagnostics: messages(result.diagnostics) };
			};
			assert.deepStrictEqual({
				routerDefault: resolve({ ...router([route('a'), route('b', 'default'), route('c')]), contextSize: 'long' }, [withLong('a'), withLong('b'), model('c')]),
				routeAsksWithoutOne: resolve(router([route('a', 'long'), route('c', 'long')]), [withLong('a'), model('c')]),
				noModelHasOne: resolve({ ...router([route('c'), route('d')]), contextSize: 'long' }, [model('c'), model('d')]),
			}, {
				routerDefault: { sizes: ['long', 'default', undefined], diagnostics: [] },
				routeAsksWithoutOne: { sizes: ['long', undefined], diagnostics: ['Route 2: c has one context size, so `context-size: long` is ignored.'] },
				noModelHasOne: { sizes: [undefined, undefined], diagnostics: ['None of this router\'s models has a larger context size, so `context-size: long` is ignored.'] },
			});
		});
	});
});
