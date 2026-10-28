/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildLlamaPresetArgs, parseLlamaConfigJson, parseLlamaPreset, type ILlamaPreset, type ILlamaServerFlagSupport } from '../../../node/copilot/localModelBridge/shim/llamaPreset.js';
import { NEAR_FIT_OVERRIDES } from '../../../node/copilot/localModelBridge/shim/servingProfile.js';

/** MAI v3 `llama-default.ini` (reconstructed from the published v3 arguments). */
const MAI_V3_INI = [
	'version = 1',
	'',
	'[MAI-Code-1.1-Flash]',
	'load-on-startup = true',
	'ctx-size = 262144',
	'parallel = 1',
	'spec-type = draft-dflash',
	'spec-draft-n-max = 3',
	'spec-draft-p-min = 0.2',
	'temp = 0.1',
	'top-k = 4',
	'top-p = 0.95',
	'min-p = 0.3',
	'n-gpu-layers = all',
	'spec-draft-ngl = all',
	'flash-attn = on',
	'batch-size = 2048',
	'ubatch-size = 2048',
	'fit = off',
	'ctx-checkpoints = 2',
	'cache-ram = 2048',
	'no-host = true',
	'model-draft = dflash-v3-lc1.gguf',
	'jinja = true',
	'',
].join('\r\n');

/** Long flags `llama-server --help` lists in b11459 (N1X device fixture), for the preset keys. */
const B11459_FLAGS: ILlamaServerFlagSupport = {
	flags: new Set(['--spec-type', '--spec-draft-n-max', '--spec-draft-p-min', '--spec-draft-ngl', '--spec-draft-model', '--temp', '--top-k', '--top-p', '--min-p', '--n-gpu-layers', '--flash-attn', '--batch-size', '--ubatch-size', '--fit', '--ctx-checkpoints', '--cache-ram', '--no-host', '--jinja']),
	dflashSupported: true,
};

function parse(text: string, asset = 'MAI-Code-1.1-Flash'): ILlamaPreset {
	const result = parseLlamaPreset(text, asset);
	if (!result.ok) {
		throw new Error(result.reason);
	}
	return result.preset;
}

function reason(text: string, asset = 'MAI-Code-1.1-Flash'): string {
	const result = parseLlamaPreset(text, asset);
	return result.ok ? 'ok' : result.reason;
}

const withLine = (find: string, replace: string) => MAI_V3_INI.replace(find, replace);

suite('localModel llamaPreset', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('MAI v3 golden preset arguments', () => {
		const preset = parse(MAI_V3_INI);
		assert.deepStrictEqual({
			ctxSize: preset.ctxSize,
			parallel: preset.parallel,
			draftModel: preset.draftModel,
			args: buildLlamaPresetArgs(preset, B11459_FLAGS).args.join(' '),
		}, {
			ctxSize: 262144,
			parallel: 1,
			draftModel: 'dflash-v3-lc1.gguf',
			args: '--spec-type draft-dflash --spec-draft-n-max 3 --spec-draft-p-min 0.2 --temp 0.1 --top-k 4 --top-p 0.95 --min-p 0.3 '
				+ '--n-gpu-layers all --spec-draft-ngl all --flash-attn on --batch-size 2048 --ubatch-size 2048 --fit off '
				+ '--ctx-checkpoints 2 --cache-ram 2048 --no-host --spec-draft-model dflash-v3-lc1.gguf --jinja',
		});
	});

	test('section names match case-insensitively; section name and version are required', () => {
		assert.deepStrictEqual({
			lowerCaseAsset: reason(MAI_V3_INI, 'mai-code-1.1-flash'),
			otherAsset: reason(MAI_V3_INI, 'Example-Coder'),
			noVersion: reason(MAI_V3_INI.replace('version = 1', '')),
			version2: reason(MAI_V3_INI.replace('version = 1', 'version = 2')),
			twoSections: reason(`${MAI_V3_INI}\r\n[Other]\r\n`),
			globalKey: reason(MAI_V3_INI.replace('version = 1', 'version = 1\r\ntemp = 0.1')),
		}, {
			lowerCaseAsset: 'ok',
			otherAsset: 'section',
			noVersion: 'version',
			version2: 'version',
			twoSections: 'section',
			globalKey: 'unexpectedGlobalKey:temp',
		});
	});

	test('rejects unknown keys and values outside the allowlist', () => {
		assert.deepStrictEqual({
			unknownKey: reason(withLine('temp = 0.1', 'temp = 0.1\r\nrope-scaling = yarn')),
			modelKey: reason(withLine('temp = 0.1', 'temp = 0.1\r\nmodel = /etc/passwd')),
			fitAuto: reason(withLine('fit = off', 'fit = auto')),
			fitOn: reason(withLine('fit = off', 'fit = on')),
			specTypeOther: reason(withLine('spec-type = draft-dflash', 'spec-type = draft-simple')),
			parallel64: reason(withLine('parallel = 1', 'parallel = 64')),
			parallel65: reason(withLine('parallel = 1', 'parallel = 65')),
			draftPath: reason(withLine('model-draft = dflash-v3-lc1.gguf', 'model-draft = ../dflash.gguf')),
			missingDraft: reason(withLine('model-draft = dflash-v3-lc1.gguf', '')),
			jinjaOff: reason(withLine('jinja = true', 'jinja = false')),
			duplicate: reason(withLine('temp = 0.1', 'temp = 0.1\r\ntemp = 0.2')),
			tooLarge: reason(`${MAI_V3_INI}${'; padding\r\n'.repeat(7000)}`),
		}, {
			unknownKey: 'unknownKey:rope-scaling',
			modelKey: 'unknownKey:model',
			fitAuto: 'invalidValue:fit',
			fitOn: 'ok',
			specTypeOther: 'invalidValue:spec-type',
			parallel64: 'ok',
			parallel65: 'invalidValue:parallel',
			draftPath: 'invalidValue:spec-draft-model',
			missingDraft: 'missingDraftModel',
			jinjaOff: 'invalidValue:jinja',
			duplicate: 'duplicateKey:temp',
			tooLarge: 'tooLarge',
		});
	});

	test('filters optional flags the probe did not find, and drops speculative decoding as a whole', () => {
		const preset = parse(MAI_V3_INI);
		const olderBuild: ILlamaServerFlagSupport = { flags: new Set([...B11459_FLAGS.flags].filter(flag => flag !== '--cache-ram' && flag !== '--ctx-checkpoints')), dflashSupported: true };
		const noDflash: ILlamaServerFlagSupport = { flags: B11459_FLAGS.flags, dflashSupported: false };
		assert.deepStrictEqual({
			olderBuild: buildLlamaPresetArgs(preset, olderBuild),
			noDflash: buildLlamaPresetArgs(preset, noDflash),
		}, {
			olderBuild: {
				args: ['--spec-type', 'draft-dflash', '--spec-draft-n-max', '3', '--spec-draft-p-min', '0.2', '--temp', '0.1', '--top-k', '4', '--top-p', '0.95', '--min-p', '0.3', '--n-gpu-layers', 'all', '--spec-draft-ngl', 'all', '--flash-attn', 'on', '--batch-size', '2048', '--ubatch-size', '2048', '--fit', 'off', '--no-host', '--spec-draft-model', 'dflash-v3-lc1.gguf', '--jinja'],
				speculative: true,
				droppedFlags: ['--ctx-checkpoints', '--cache-ram'],
			},
			noDflash: {
				args: ['--temp', '0.1', '--top-k', '4', '--top-p', '0.95', '--min-p', '0.3', '--n-gpu-layers', 'all', '--flash-attn', 'on', '--batch-size', '2048', '--ubatch-size', '2048', '--fit', 'off', '--ctx-checkpoints', '2', '--cache-ram', '2048', '--no-host', '--jinja'],
				speculative: false,
				droppedFlags: [],
			},
		});
	});

	test('llama-config.json (current registry contract): the published MAI and Qwen configs, and rejections', () => {
		const maiConfig = { model: 'MAI-Code-1.1-Flash-Q2-XS.gguf', draftModel: 'dflash-v3-lc1.gguf', ctxSize: 262144, parallel: 1, nGpuLayers: 999, args: ['--spec-type', 'draft-dflash', '--spec-draft-n-max', '3', '--spec-draft-p-min', '0.2', '--spec-draft-ngl', 'all', '--flash-attn', 'on', '--batch-size', '2048', '--ubatch-size', '2048', '--fit', 'off', '--ctx-checkpoints', '0', '--no-host'] };
		const qwenConfig = { model: 'Qwen3.5-4B-Q4_K_M.gguf', ctxSize: 262144, parallel: 1, nGpuLayers: 999, args: ['--jinja', '--temp', '0.6', '--top-k', '20', '--top-p', '0.95', '--min-p', '0.0', '--flash-attn', 'on', '--batch-size', '2048', '--ubatch-size', '2048', '--fit', 'off', '--ctx-checkpoints', '0', '--no-host'] };
		const json = (config: object, asset = 'MAI-Code-1.1-Flash') => parseLlamaConfigJson(JSON.stringify(config, undefined, 2), asset);
		const summary = (config: object, asset?: string) => {
			const result = json(config, asset);
			return result.ok ? { ctxSize: result.preset.ctxSize, parallel: result.preset.parallel, primaryModel: result.preset.primaryModel, draftModel: result.preset.draftModel, args: buildLlamaPresetArgs(result.preset, B11459_FLAGS).args.join(' ') } : result.reason;
		};
		const rejected = (config: object) => {
			const result = json(config);
			return result.ok ? 'ok' : result.reason;
		};
		assert.deepStrictEqual({
			mai: summary(maiConfig),
			qwen: summary(qwenConfig, 'Qwen3.5-4B-Q4-K-M'),
			unknownField: rejected({ ...maiConfig, extra: true }),
			unknownFlag: rejected({ ...maiConfig, args: [...maiConfig.args, '--rope-scaling', 'yarn'] }),
			hostOwnedFlag: rejected({ ...maiConfig, args: [...maiConfig.args, '--ctx-size', '4096'] }),
			modelFlag: rejected({ ...maiConfig, args: [...maiConfig.args, '--model', 'x.gguf'] }),
			duplicate: rejected({ ...maiConfig, args: [...maiConfig.args, '--fit', 'on'] }),
			missingValue: rejected({ ...maiConfig, args: ['--temp'] }),
			draftWithoutSpecType: rejected({ ...maiConfig, args: maiConfig.args.slice(2) }),
			specTypeWithoutDraft: rejected({ ...maiConfig, draftModel: undefined }),
			draftIsPrimary: rejected({ ...maiConfig, draftModel: maiConfig.model }),
			modelPath: rejected({ ...maiConfig, model: '../x.gguf' }),
			parallel65: rejected({ ...maiConfig, parallel: 65 }),
			notJson: parseLlamaConfigJson('version = 1', 'MAI-Code-1.1-Flash').ok,
		}, {
			mai: {
				ctxSize: 262144,
				parallel: 1,
				primaryModel: 'MAI-Code-1.1-Flash-Q2-XS.gguf',
				draftModel: 'dflash-v3-lc1.gguf',
				args: '--spec-type draft-dflash --spec-draft-n-max 3 --spec-draft-p-min 0.2 --spec-draft-ngl all --flash-attn on --batch-size 2048 --ubatch-size 2048 --fit off '
					+ '--ctx-checkpoints 0 --no-host --n-gpu-layers 999 --spec-draft-model dflash-v3-lc1.gguf --jinja',
			},
			qwen: {
				ctxSize: 262144,
				parallel: 1,
				primaryModel: 'Qwen3.5-4B-Q4_K_M.gguf',
				draftModel: undefined,
				args: '--temp 0.6 --top-k 20 --top-p 0.95 --min-p 0.0 --flash-attn on --batch-size 2048 --ubatch-size 2048 --fit off --ctx-checkpoints 0 --no-host --n-gpu-layers 999 --jinja',
			},
			unknownField: 'unknownField:extra',
			unknownFlag: 'unknownKey:rope-scaling',
			hostOwnedFlag: 'unknownKey:ctx-size',
			modelFlag: 'unknownKey:model',
			duplicate: 'duplicateKey:fit',
			missingValue: 'invalidValue:temp',
			draftWithoutSpecType: 'speculativeWithoutSpecType',
			specTypeWithoutDraft: 'missingDraftModel',
			draftIsPrimary: 'draftIsPrimary',
			modelPath: 'invalidValue:model',
			parallel65: 'invalidValue:parallel',
			notJson: false,
		});
	});

	test('applies near-fit and downgrade overrides in place', () => {
		const preset = parse(MAI_V3_INI);
		assert.deepStrictEqual({
			nearFit: buildLlamaPresetArgs(preset, B11459_FLAGS, NEAR_FIT_OVERRIDES).args.join(' '),
			downgraded: buildLlamaPresetArgs(preset, B11459_FLAGS, { flashAttn: 'auto', dropSpeculative: true }).args.join(' '),
		}, {
			nearFit: '--spec-type draft-dflash --spec-draft-n-max 3 --spec-draft-p-min 0.2 --temp 0.1 --top-k 4 --top-p 0.95 --min-p 0.3 '
				+ '--n-gpu-layers auto --spec-draft-ngl all --flash-attn on --batch-size 2048 --ubatch-size 2048 --fit on '
				+ '--ctx-checkpoints 2 --cache-ram 2048 --no-host --spec-draft-model dflash-v3-lc1.gguf --jinja',
			downgraded: '--temp 0.1 --top-k 4 --top-p 0.95 --min-p 0.3 --n-gpu-layers all --flash-attn auto --batch-size 2048 --ubatch-size 2048 --fit off '
				+ '--ctx-checkpoints 2 --cache-ram 2048 --no-host --jinja',
		});
	});

	test('a context checkpoint override replaces the preset\'s in place, or is added when the preset has none', () => {
		const withCheckpoints = parse(MAI_V3_INI);
		const withoutCheckpoints = { ...withCheckpoints, entries: withCheckpoints.entries.filter(entry => entry.key !== 'ctx-checkpoints') };
		const checkpoints = (args: readonly string[]) => args.flatMap((arg, index) => arg === '--ctx-checkpoints' ? [args[index + 1]] : []);
		assert.deepStrictEqual({
			replaced: checkpoints(buildLlamaPresetArgs(withCheckpoints, B11459_FLAGS, { ctxCheckpoints: '4' }).args),
			added: checkpoints(buildLlamaPresetArgs(withoutCheckpoints, B11459_FLAGS, { ctxCheckpoints: '4' }).args),
			unchanged: checkpoints(buildLlamaPresetArgs(withCheckpoints, B11459_FLAGS).args),
		}, { replaced: ['4'], added: ['4'], unchanged: ['2'] });
	});
});
