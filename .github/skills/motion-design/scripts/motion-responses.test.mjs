/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-new-javascript-files -- Dependency-free tests for the motion-response authoring CLI. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { deriveMotionResponses, evaluateCriticalResponse, generateMotionResponses, runCli, timeForRemaining } from './generate-motion-responses.mjs';

const sourceUrl = new URL('../../../../src/vs/platform/theme/common/motion/motionResponsePresets.json', import.meta.url);
const outputUrl = new URL('../../../../src/vs/platform/theme/common/motion/motionResponses.ts', import.meta.url);
const sourceText = await readFile(sourceUrl, 'utf8');
const source = JSON.parse(sourceText);
const presets = deriveMotionResponses(source);

function close(actual, expected, tolerance = 1e-9) {
	assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, got ${actual}`);
}

function parseSamples(easing) {
	assert.match(easing, /^linear\([\d., ]+\)$/);
	return easing.slice(7, -1).split(',').map(Number);
}

function sampleCss(samples, time) {
	if (time === 1) {
		return samples[samples.length - 1];
	}
	const segment = time * (samples.length - 1);
	const index = Math.floor(segment);
	return samples[index] + (samples[index + 1] - samples[index]) * (segment - index);
}

test('critical response has the known initial state, inflection value, and peak speed', () => {
	for (const frequency of [0.1, 4.5, 6, 100]) {
		const omega = 2 * Math.PI * frequency;
		assert.deepEqual(evaluateCriticalResponse(frequency, 0), { position: 0, remaining: 1, speed: 0 });
		const atPeak = evaluateCriticalResponse(frequency, 1 / omega);
		close(atPeak.position, 1 - 2 / Math.E);
		close(atPeak.speed, omega / Math.E);
		close(evaluateCriticalResponse(frequency, 2 / omega).position, 1 - 3 / Math.exp(2));
		close(timeForRemaining(frequency, 2 / Math.E), 1 / omega);
		assert.ok(evaluateCriticalResponse(frequency, 0.99 / omega).speed < atPeak.speed);
		assert.ok(evaluateCriticalResponse(frequency, 1.01 / omega).speed < atPeak.speed);
	}
});

test('doubling frequency halves response and settling times while doubling speed', () => {
	for (const remaining of [0.5, 0.02, 0.001, 1e-8]) {
		close(timeForRemaining(9, remaining) * 2, timeForRemaining(4.5, remaining));
	}
	const slow = evaluateCriticalResponse(4.5, 0.07);
	const fast = evaluateCriticalResponse(9, 0.035);
	close(fast.position, slow.position);
	close(fast.speed, slow.speed * 2);
});

test('analytic response is finite, monotone, bounded, and remains inside the settling band', () => {
	for (const preset of presets) {
		const { frequencyHz, durationMs, metrics, limits } = preset;
		close(evaluateCriticalResponse(frequencyHz, metrics.response50Ms / 1000).position, 0.5, 1e-8);
		close(evaluateCriticalResponse(frequencyHz, metrics.settle2PercentMs / 1000).remaining, 0.02, 1e-9);
		assert.ok(evaluateCriticalResponse(frequencyHz, metrics.settle2PercentMs / 1000 - 1e-6).remaining > 0.02);
		assert.ok(evaluateCriticalResponse(frequencyHz, durationMs / 1000 - 1e-6).remaining > limits.maxEndpointResidual);
		assert.ok(metrics.endpointResidual <= limits.maxEndpointResidual);
		assert.ok(metrics.response50Ms < metrics.settle2PercentMs && metrics.settle2PercentMs < durationMs);
		let previous = 0;
		for (let index = 0; index <= 10000; index++) {
			const time = durationMs / 1000 * index / 2500;
			const response = evaluateCriticalResponse(frequencyHz, time);
			assert.ok(Object.values(response).every(Number.isFinite));
			assert.ok(response.position >= previous && response.position >= 0 && response.position <= 1 && response.speed >= 0);
			if (time >= metrics.settle2PercentMs / 1000) {
				assert.ok(response.remaining <= 0.02);
			}
			previous = response.position;
		}
	}
});

test('serialized CSS meets its error bound under an independent dense evaluation, including the forced endpoint', () => {
	for (const preset of presets) {
		const samples = parseSamples(preset.easing);
		const durationSeconds = preset.durationMs / 1000;
		let observedError = 0;
		for (let index = 0; index <= 100000; index++) {
			const time = index / 100000;
			const omegaTime = 2 * Math.PI * preset.frequencyHz * durationSeconds * time;
			const independentPosition = 1 - (1 + omegaTime) / Math.exp(omegaTime);
			const cssPosition = sampleCss(samples, time);
			observedError = Math.max(observedError, Math.abs(cssPosition - independentPosition));
			assert.ok(Number.isFinite(cssPosition) && cssPosition >= 0 && cssPosition <= 1);
		}
		assert.ok(observedError <= preset.metrics.maxInterpolationError);
		assert.ok(preset.metrics.maxInterpolationError <= preset.limits.maxInterpolationError);
		assert.ok(preset.metrics.maxInterpolationError * preset.limits.maxTravelPx < 1);
		assert.ok(samples.every((value, index) => index === 0 || value >= samples[index - 1]));
		assert.deepEqual([samples[0], samples.at(-1), samples.length], [0, 1, preset.metrics.sampleCount]);
		assert.ok(samples.length <= 512);
		const terminalError = (1 + 2 * Math.PI * preset.frequencyHz * durationSeconds) / Math.exp(2 * Math.PI * preset.frequencyHz * durationSeconds);
		close(preset.metrics.endpointResidual, terminalError, 1e-12);
		const speeds = samples.slice(1).map((value, index) => (value - samples[index]) * (samples.length - 1) / durationSeconds);
		close(preset.metrics.cssInitialSpeed, speeds[0]);
		close(preset.metrics.cssTerminalSpeed, speeds.at(-1));
		close(preset.metrics.cssPeakSpeed, Math.max(...speeds));
		assert.ok(preset.metrics.cssInitialSpeed > 0 && preset.metrics.cssTerminalSpeed > 0 && preset.metrics.analyticTerminalSpeed > 0);
	}
});

test('changing a source frequency derives duration and metrics together without mutating authoring data', () => {
	const changed = structuredClone(source);
	changed.presets[0].frequencyHz *= 2;
	const before = structuredClone(changed);
	const derived = deriveMotionResponses(changed);
	close(derived[0].durationMs * 2, presets[0].durationMs);
	close(derived[0].metrics.response50Ms * 2, presets[0].metrics.response50Ms, 1.1e-6);
	close(derived[0].metrics.peakSpeed, presets[0].metrics.peakSpeed * 2, 1.1e-9);
	assert.deepEqual(changed, before);
	assert.deepEqual(derived[1], presets[1]);
});

test('equal dimensionless criteria compile to the same CSS shape across supported frequencies', () => {
	for (const frequency of [0.1, 0.37, 4.5, 6, 9, 100]) {
		const changed = structuredClone(source);
		changed.presets[0].frequencyHz = frequency;
		const [candidate] = deriveMotionResponses(changed);
		assert.equal(candidate.easing, presets[1].easing);
		close(candidate.durationMs * frequency, presets[1].durationMs * presets[1].frequencyHz);
		assert.deepEqual(
			[candidate.metrics.sampleCount, candidate.metrics.endpointResidual, candidate.metrics.maxInterpolationError],
			[presets[1].metrics.sampleCount, presets[1].metrics.endpointResidual, presets[1].metrics.maxInterpolationError],
		);
	}
});

test('invalid authoring records fail explicitly rather than defaulting, dropping, or clamping values', () => {
	const invalid = [
		[value => { value.schemaVersion = 2; }, /schemaVersion/],
		[value => { value.presets.pop(); }, /exactly/],
		[value => { value.presets.push(value.presets[0]); }, /exactly/],
		[value => { value.presets[1].id = value.presets[0].id; }, /unique/],
		[value => { value.presets[0].id = 'other'; }, /candidate id/],
		[value => { value.presets[0].label = ''; }, /label/],
		[value => { value.presets[0].sourcePreset = 'imaginary'; }, /sourcePreset/],
		[value => { value.source.revision = 'main'; }, /commit hash/],
		[value => { value.source.repository = 'https://example.com'; }, /Feel/],
		[value => { value.presets[0].frequencyHz = 0; }, /frequencyHz/],
		[value => { value.presets[0].frequencyHz = -6; }, /frequencyHz/],
		[value => { value.presets[0].frequencyHz = 101; }, /frequencyHz/],
		[value => { value.presets[0].frequencyHz = NaN; }, /frequencyHz/],
		[value => { value.presets[0].frequencyHz = Infinity; }, /frequencyHz/],
		[value => { value.presets[0].frequencyHz = '6'; }, /frequencyHz/],
		[value => { value.presets[0].dampingRatio = 0.8; }, /critically damped/],
		[value => { value.presets[0].mass = 2; }, /unit mass/],
		[value => { delete value.presets[0].mass; }, /mass is required/],
		[value => { value.presets[0].durationMs = 200; }, /durationMs is not supported/],
		[value => { value.accuracy.maxEndpointResidual = 0; }, /maxEndpointResidual/],
		[value => { value.accuracy.maxInterpolationError = value.accuracy.maxEndpointResidual; }, /budget/],
		[value => { value.accuracy.maxTravelPx = 10000; }, /subpixel/],
		[value => { value.accuracy.maxEndpointResidual = 1e-8; value.accuracy.maxInterpolationError = 1e-7; }, /sample limit/],
	];
	for (const [mutate, expected] of invalid) {
		const value = structuredClone(source);
		mutate(value);
		assert.throws(() => deriveMotionResponses(value), expected);
	}
	for (const value of [null, [], 42]) {
		assert.throws(() => deriveMotionResponses(value), /must be an object/);
	}
	assert.throws(() => generateMotionResponses('{'), /Invalid motion response JSON/);
	assert.throws(() => generateMotionResponses(' '.repeat(65537)), /65536 bytes/);
});

test('analytic helpers reject invalid and out-of-budget ranges', () => {
	for (const frequency of [NaN, Infinity, -1, 0, 101, '6']) {
		assert.throws(() => evaluateCriticalResponse(frequency, 0.1), /frequencyHz/);
		assert.throws(() => timeForRemaining(frequency, 0.02), /frequencyHz/);
	}
	for (const time of [NaN, Infinity, -1, 61]) {
		assert.throws(() => evaluateCriticalResponse(6, time), /timeSeconds/);
	}
	for (const remaining of [NaN, Infinity, -1, 0, 1, 1.1, 1e-20]) {
		assert.throws(() => timeForRemaining(6, remaining), /remaining/);
	}
});

test('generation is deterministic, binds the exact source digest, and emits localized readonly data', async () => {
	const generated = generateMotionResponses(sourceText);
	assert.equal(generateMotionResponses(sourceText), generated);
	assert.equal(await readFile(outputUrl, 'utf8'), generated);
	const digest = `sha256:${createHash('sha256').update(sourceText, 'utf8').digest('hex')}`;
	assert.ok(generated.includes(`motionResponseSourceDigest = '${digest}'`));
	assert.ok(!generateMotionResponses(`${sourceText}\n`).includes(digest));
	for (const preset of presets) {
		assert.ok(generated.includes(`localize('motion.response.${preset.id}', ${JSON.stringify(preset.label)})`));
	}
	assert.match(generated, /\] as const;/);
});

test('CLI only writes the fixed module and never mutates output when checking stale or missing data', async () => {
	let output = '';
	const writes = [];
	const io = {
		readFile: async path => path.href === sourceUrl.href ? sourceText : output,
		writeFile: async (path, content) => { writes.push(path.href); output = content; },
	};
	await runCli([], io);
	assert.deepEqual(writes, [outputUrl.href]);
	assert.equal(output, generateMotionResponses(sourceText));
	writes.length = 0;
	await runCli(['--check'], io);
	output += '// stale\n';
	await assert.rejects(runCli(['--check'], io), /stale/);
	await assert.rejects(runCli(['--check'], {
		...io,
		readFile: async path => {
			if (path.href === sourceUrl.href) {
				return sourceText;
			}
			throw Object.assign(new Error('missing'), { code: 'ENOENT' });
		},
	}), /missing or stale/);
	await assert.rejects(runCli(['--output', 'elsewhere.ts'], io), /Usage/);
	await assert.rejects(runCli([], { ...io, readFile: async () => '{}' }), /required/);
	assert.deepEqual(writes, []);
});

test('finite CLI check succeeds on generated output and exits nonzero for invalid arguments', () => {
	const script = fileURLToPath(new URL('./generate-motion-responses.mjs', import.meta.url));
	assert.match(execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', timeout: 10000 }), /is current/);
	assert.throws(() => execFileSync(process.execPath, [script, '--invalid'], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' }), error =>
		error.status === 1 && /Usage/.test(error.stderr)
	);
});
