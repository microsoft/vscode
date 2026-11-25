/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { ContextSizeConfigKey, createContextSizeConfigSchemaPropertyFromLimits } from '../../common/agentModelConfiguration.js';
import { readAgentModelRouterRoutesMeta, withAgentModelExperimentalMeta, withAgentModelRouterRoutesMeta } from '../../common/meta/agentModelMeta.js';
import { IModelRouter, IModelRouterDiagnostic, matchModelReference, ModelReferenceMatch, MODEL_ROUTER_MAX_DECISION_TEXT_BYTES, MODEL_ROUTER_MAX_FILE_BYTES, ModelRouterDiagnosticSeverity, modelRouterDecisionTextBytes, modelRouterNameFromDisplayName, modelRouterNameFromFileName, modelRouterNameFromModelId, parseModelRouter, resolveModelRouter, summarizeModelRouterRoutes, withModelRouterSwitching, writeModelRouter } from '../../common/modelRouter.js';
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
				// Nothing is decided for a router's only route, so it needs no `when`.
				oneGuidedRouteWithoutWhen: check('routes:\n  - model: a\n    guidance: Plan first.'),
				oneRoute: check('routes:\n  - model: a\n    when: A.'),
				oneRouteWithoutWhen: check('routes:\n  - model: a'),
				sameName: check('routes:\n  - name: one\n    model: a\n    when: A.\n  - name: one\n    model: b\n    when: B.'),
				sameModel: check('routes:\n  - model: a\n    when: A.\n  - model: a\n    when: B.\n    effort: low'),
				badName: check('routes:\n  - name: Bug_Fix\n    model: a\n    when: A.\n  - model: b\n    when: B.'),
				// A chat that moves to another route gets that route's guidance, so the two go together.
				autoSwitching: check(`switching: auto\n${guided}`),
				longGuidance: check(`${guided} ${'x'.repeat(4000)}`),
				// The preview format, which this build no longer reads.
				playbooks: check('playbooks:\n  one:\n    when: A.\n    main: a'),
				roles: check(`roles:\n  reviewer:\n    description: Reviews.\n${guided}`),
			}, {
				oneGuidedRoute: [],
				oneGuidedRouteWithoutWhen: [],
				oneRoute: ['A router has 2 to 10 routes; this one has 1.'],
				oneRouteWithoutWhen: ['A router has 2 to 10 routes; this one has 1.'],
				sameName: ['The name `one` is already route 1\'s; each name belongs to one route.'],
				sameModel: ['`a` is already in route 1; each model belongs to one route, unless the routes have a `name`.'],
				badName: ['Route 1\'s `name` is lowercase letters, digits and single hyphens, like `bug-fix`.'],
				autoSwitching: [],
				longGuidance: ['Route 1\'s `guidance` is too long: at most 4000 characters.'],
				playbooks: ['Write `playbooks` as `routes`: a list where each route has `model` and `when`, and can have a `name` and `guidance`.'],
				roles: ['`roles` are no longer read. To have a custom agent used, name it in a route\'s `guidance`.'],
			});
		});

		test('writes a router that reads back the same, with text that plain YAML would misread', () => {
			const full: IModelRouter = {
				name: 'daily-driver',
				displayName: 'Daily: "Driver"',
				description: 'Opus for features.\nHaiku for the rest.',
				effort: 'medium',
				contextSize: 'long',
				switching: 'auto',
				// A line that ends in spaces is a line break in Markdown, and stays one.
				guidance: 'Prefer the cheapest model that can do the job.  \n\nWhen unsure: ask.',
				routes: [
					{ name: 'feature', models: ['claude-opus-5.5', 'vendor/opus,large'], when: 'Building a feature:\n  several files, or a plan.', examples: ['add a "dark mode" setting', 'refactor #12: the parser', 'yes'], effort: 'high', contextSize: 'default', mainAgentGuidance: 'Plan first.\nThen run the tests.' },
					{ models: ['anthropic/claude-haiku-4-5'], when: 'Errors like "E1: failed" #1, and it\'s quick.', examples: [], mainAgentGuidance: 'Answer in one line.' },
				],
			};
			// What the parser assumes is not written, and a router named after its file needs no name.
			const { name, ...plain }: IModelRouter = { name: 'plain', description: 'Two models.', effort: 'auto', switching: 'first-turn', guidance: '', routes: [{ models: ['a'], when: 'One.', examples: [] }, { models: ['b'], when: 'Two.', examples: [] }] };
			assert.deepStrictEqual({
				fileName: modelRouterNameFromDisplayName(' Daily: "Driver" '),
				full: parseModelRouter(writeModelRouter(full), 'renamed.model-router.yaml'),
				plain: writeModelRouter(plain),
				plainRead: parseModelRouter(writeModelRouter(plain), `${name}.model-router.yaml`).router,
			}, {
				fileName: 'daily-driver',
				full: { router: full, diagnostics: [], name: 'daily-driver' },
				plain: 'version: 1\ndescription: Two models.\nroutes:\n  - model: a\n    when: One.\n  - model: b\n    when: Two.\n',
				plainRead: { name, ...plain },
			});
		});

		test('sets `switching` in a file without changing anything else in it', () => {
			const withoutKey = '# My routes\ndescription: d\nroutes:\n  - model: a\n';
			const withKey = 'switching: first-turn # stay put\r\nroutes: []\r\n';
			assert.deepStrictEqual({
				added: withModelRouterSwitching(withoutKey, 'auto'),
				changed: withModelRouterSwitching(withKey, 'auto'),
				unchanged: withModelRouterSwitching(withKey, 'first-turn'),
				quotedKey: withModelRouterSwitching('"switching": \'first-turn\'\n"routes": []\n', 'auto'),
				byteOrderMark: withModelRouterSwitching('\uFEFFswitching: first-turn\nroutes: []\n', 'auto'),
				read: parseModelRouter(withModelRouterSwitching(valid, 'auto'), 'daily-driver.model-router.yaml').router?.switching,
			}, {
				added: '# My routes\ndescription: d\nswitching: auto\nroutes:\n  - model: a\n',
				changed: 'switching: auto # stay put\r\nroutes: []\r\n',
				unchanged: withKey,
				quotedKey: '"switching": auto\n"routes": []\n',
				byteOrderMark: '\uFEFFswitching: auto\nroutes: []\n',
				read: 'auto',
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
		function model(id: string, options: { byok?: string; efforts?: string[]; policy?: PolicyState; retiring?: string; experimental?: boolean } = {}): IAgentModelInfo {
			const meta = { ...createAgentModelByokMeta(options.byok), ...(options.retiring ? { warningText: { model_pending_deprecation: options.retiring } } : {}), ...withAgentModelExperimentalMeta(undefined, options.experimental ? 'Experimental' : undefined) };
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

		test('a model family without a version is the newest released model of that family the account can use', () => {
			const models = [
				model('claude-opus-5'), model('claude-opus-5.5'), model('claude-sonnet-5.5'), model('gpt-4o-mini'),
				model('acme-pro-1'), model('acme-pro-2'), model('acme-pro-3', { policy: PolicyState.Disabled }), model('acme-pro-2-fast'),
				model('acme-lite-1'), model('acme-lite-2', { experimental: true }), model('acme-lab-1', { experimental: true }), model('acme-nightly', { experimental: true }),
				model('acme-max-1', { policy: PolicyState.Disabled }), model('acme-max-1-fast'), model('acme-chat-4o'), model('acme-chat-5', { policy: PolicyState.Disabled }),
				model('byok-dated', { byok: 'anthropic/Work/claude-haiku-4-20261001' }), model('byok-new', { byok: 'anthropic/Work/claude-haiku-4-5-20251001' }), model('byok-new-older', { byok: 'anthropic/Work/claude-haiku-4-5-20250901' }), model('byok-newest', { byok: 'anthropic/Work/claude-haiku-4-5-2025-11-01' }),
				model('byok-home', { byok: 'anthropic/Home/claude-haiku-4-5-20251001' }), model('byok-nested', { byok: 'openrouter/OpenRouter 2/aion-labs/aion-3.0' }), model('byok-attached-older', { byok: 'ollama/llama3' }), model('byok-attached', { byok: 'ollama/llama3.2' }),
			];
			const match = (reference: string) => {
				const result = matchModelReference(models, reference);
				return result?.kind === 'ambiguous' ? result.families ?? result.models.map(candidate => candidate.id) : result?.kind === 'experimental' ? { experimental: result.models.map(candidate => candidate.id) } : modelId(result);
			};
			assert.deepStrictEqual({
				opus: match('opus'),
				withVendorWord: match('claude-opus'),
				// Not the fast variant, and not the newest one, which policy turned off.
				newestUsable: match('pro'),
				variant: match('pro-fast'),
				// An experimental model is never a family's newest, and a family of only those picks none.
				newestReleased: match('lite'),
				onlyExperimental: match('lab'),
				experimentalById: match('acme-nightly'),
				// A family whose models are all turned off is not replaced by its fast variant: the caller reports it and tries the next model.
				allDisabled: match('max'),
				// A letter after a number is part of the version: `4o` is the family's version 4, used while policy has the newer one turned off.
				alphanumericVersion: match('chat'),
				// A snapshot's date is not part of its version: 4.5 is newer than 4, whenever each was made. A date is the same written together or apart.
				byokInGroup: match('anthropic/Work/haiku'),
				// The same family in two groups is two families, and an id's own path is written in full.
				byokInTwoGroups: match('anthropic/haiku'),
				byokNestedId: [match('openrouter/aion-labs/aion'), match('openrouter/aion')],
				// A version can be written onto the name.
				byokAttachedVersion: match('ollama/llama'),
				// A version asks for that model, so a missing one is not replaced by its family.
				missingVersion: match('claude-opus-7'),
				missingAlphanumericVersion: match('gpt-4o'),
				manyFamilies: match('claude'),
				unknown: match('gemini'),
			}, {
				opus: 'claude-opus-5.5',
				withVendorWord: 'claude-opus-5.5',
				newestUsable: 'acme-pro-2',
				variant: 'acme-pro-2-fast',
				newestReleased: 'acme-lite-1',
				onlyExperimental: { experimental: ['acme-lab-1'] },
				experimentalById: 'acme-nightly',
				allDisabled: 'acme-max-1',
				alphanumericVersion: 'acme-chat-4o',
				byokInGroup: 'byok-newest',
				byokInTwoGroups: ['anthropic/Work/claude-haiku', 'anthropic/Home/claude-haiku'],
				byokNestedId: ['byok-nested', undefined],
				byokAttachedVersion: 'byok-attached',
				missingVersion: undefined,
				missingAlphanumericVersion: undefined,
				manyFamilies: ['claude-opus', 'claude-sonnet'],
				unknown: undefined,
			});
			const result = resolveModelRouter(router([{ models: ['opus'], when: 'A.', examples: [] }, { models: ['claude', 'lab', 'max', 'pro'], when: 'B.', examples: [] }]), models);
			assert.deepStrictEqual({ routes: result.routes.map(r => [r.model.id, r.reference]), diagnostics: messages(result.diagnostics), skipped: result.skipped }, {
				routes: [['claude-opus-5.5', 'opus'], ['acme-pro-2', 'pro']],
				diagnostics: [
					'Route 2: `claude` matches more than one model family; use one of `claude-opus`, `claude-sonnet`.',
					'Route 2: `lab` matches only experimental models, which a family never picks; use the id of one, such as `acme-lab-1`.',
					'Route 2: acme-max-1 is disabled by policy.',
					'Route 2 uses `pro` because `claude` is not available.',
				],
				// The route found a model it can use, so its row has nothing to say about the others.
				skipped: [],
			});
		});

		test('reports a BYOK id that matches more than one model, and the full id picks one', () => {
			const models = [model('w', { byok: 'anthropic/Work/claude-haiku-4-5' }), model('h', { byok: 'anthropic/Home/claude-haiku-4-5' }), model('b')];
			assert.strictEqual(matchModelReference(models, 'anthropic/claude-haiku-4-5')?.kind, 'ambiguous');
			assert.strictEqual(modelId(matchModelReference(models, 'anthropic/Home/claude-haiku-4-5')), 'h');
			const result = resolveModelRouter(router([{ models: ['anthropic/claude-haiku-4-5'], when: 'A.', examples: [] }, { models: ['b'], when: 'B.', examples: [] }]), models);
			assert.deepStrictEqual(result.routes.map(r => r.model.id), ['b']);
			assert.ok(result.diagnostics[0].message.includes('`anthropic/Work/claude-haiku-4-5`, `anthropic/Home/claude-haiku-4-5`'));
			// The route is left out, with the ids that tell the two models apart.
			assert.deepStrictEqual(result.skipped.map(skip => [skip.index, skip.reason === 'unavailable' ? skip.unusable : skip.key]), [
				[0, [{ kind: 'ambiguousModel', reference: 'anthropic/claude-haiku-4-5', candidates: ['anthropic/Work/claude-haiku-4-5', 'anthropic/Home/claude-haiku-4-5'] }]],
			]);
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

		test('a router\'s picker row lists its routes that have a model, with what the router sets each to', () => {
			const contextSizes = { type: 'number' as const, title: 'Context', enum: [200_000, 1_000_000] };
			const models = [model('a', { efforts: ['low', 'medium', 'high'] }), model('b', { efforts: ['low'] }), { ...model('c'), configSchema: { type: 'object' as const, properties: { [ContextSizeConfigKey]: contextSizes } } }];
			const routes: IModelRouter['routes'] = [
				{ models: ['a'], when: 'A.', examples: [], name: 'build', effort: 'high' },
				{ models: ['b'], when: 'B.', examples: [] },
				{ models: ['c'], when: 'C.', examples: [], contextSize: 'long' },
				{ models: ['gone'], when: 'D.', examples: [] },
			];
			const summarize = (candidate: IModelRouter) => summarizeModelRouterRoutes(candidate, resolveModelRouter(candidate, models).routes);
			// The routes are added to the router's row beside what it already carries.
			const row = { ...model('row'), _meta: withAgentModelRouterRoutesMeta({ other: 1 }, summarize(router(routes))) };
			assert.deepStrictEqual({
				chosen: readAgentModelRouterRoutesMeta(row),
				kept: row._meta?.other,
				effortOff: summarize(router(routes, 'off')),
				// Effort is chosen with the route, so it is not chosen when one route is left.
				oneRoute: summarize(router(routes.slice(1, 2))),
				// A row from another host lists only what reads as a route.
				malformed: readAgentModelRouterRoutesMeta({ ...model('row'), _meta: { 'vscode.chat.modelRouterRoutes': [{ model: 'A', when: 4, effort: 3, contextTokens: -1 }, { name: 'x' }, 'y'] } }),
				otherModel: readAgentModelRouterRoutesMeta(model('row')),
			}, {
				chosen: [{ name: 'build', model: 'a', when: 'A.', effort: 'high' }, { model: 'b', when: 'B.', effort: 'auto' }, { model: 'c', when: 'C.', contextTokens: 1_000_000 }],
				kept: 1,
				effortOff: [{ name: 'build', model: 'a', when: 'A.' }, { model: 'b', when: 'B.' }, { model: 'c', when: 'C.', contextTokens: 1_000_000 }],
				oneRoute: [{ model: 'b', when: 'B.' }],
				malformed: [{ model: 'A' }],
				otherModel: [],
			});
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
			assert.deepStrictEqual({ routes: result.routes.map(resolved => [resolved.route.name, resolved.model.id]), diagnostics: messages(result.diagnostics), skipped: result.skipped.map(skip => [skip.route.name, skip.reason]) }, {
				routes: [['feature', 'a'], ['bug-fix', 'a'], [undefined, 'a']],
				diagnostics: [
					'Route `bug-fix` uses `a` because `gone` is not available.',
					'Route `quick` (gone) is skipped: none of its models are available on this account.',
					'Route `a` is skipped: `a` is the name of one route and the model of another.',
				],
				// A route that falls back to a later model is still used, so only the other two are left out.
				skipped: [['quick', 'unavailable'], ['a', 'sharedKey']],
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
