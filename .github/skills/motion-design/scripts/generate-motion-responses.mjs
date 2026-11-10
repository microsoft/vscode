/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-no-new-javascript-files -- Dependency-free authoring CLI and pure derivation for prebuilt motion responses. */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('../../../../src/vs/platform/theme/common/motion/motionResponsePresets.json', import.meta.url);
const outputUrl = new URL('../../../../src/vs/platform/theme/common/motion/motionResponses.ts', import.meta.url);
const regenerateCommand = 'node .github/skills/motion-design/scripts/generate-motion-responses.mjs';
const maxSamples = 512;
const progressDecimalPlaces = 9;
const progressRoundingError = 0.5 * 10 ** -progressDecimalPlaces;
const arithmeticAllowance = 1e-12;

function requireRecord(value, keys, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${path} must be an object`);
	}
	for (const key of keys) {
		if (!Object.hasOwn(value, key)) {
			throw new TypeError(`${path}.${key} is required`);
		}
	}
	for (const key of Object.keys(value)) {
		if (!keys.includes(key)) {
			throw new TypeError(`${path}.${key} is not supported`);
		}
	}
}

function requireNumber(value, minimum, maximum, path) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
		throw new RangeError(`${path} must be a finite number in [${minimum}, ${maximum}]`);
	}
}

function requireText(value, path) {
	if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
		throw new TypeError(`${path} must be nonempty text without surrounding whitespace or control characters (at most 1024 characters)`);
	}
}

function validateSource(source) {
	requireRecord(source, ['$comment', 'schemaVersion', 'source', 'accuracy', 'presets'], 'source');
	requireText(source.$comment, 'source.$comment');
	if (source.schemaVersion !== 1) {
		throw new RangeError('source.schemaVersion must be 1');
	}
	requireRecord(source.source, ['repository', 'revision', 'path', 'license'], 'source.source');
	if (source.source.repository !== 'https://github.com/diip3sh/feel' || source.source.path !== 'runtime/feel.js' || source.source.license !== 'MIT') {
		throw new RangeError('source.source must identify the MIT-licensed Feel runtime/feel.js seed parameters');
	}
	if (typeof source.source.revision !== 'string' || !/^[a-f0-9]{40}$/.test(source.source.revision)) {
		throw new TypeError('source.source.revision must be a full lowercase Git commit hash');
	}
	requireRecord(source.accuracy, ['maxEndpointResidual', 'maxInterpolationError', 'maxTravelPx'], 'source.accuracy');
	requireNumber(source.accuracy.maxEndpointResidual, 1e-8, 0.001, 'source.accuracy.maxEndpointResidual');
	requireNumber(source.accuracy.maxInterpolationError, 1e-7, 0.01, 'source.accuracy.maxInterpolationError');
	requireNumber(source.accuracy.maxTravelPx, 1, 10000, 'source.accuracy.maxTravelPx');
	if (source.accuracy.maxInterpolationError <= source.accuracy.maxEndpointResidual + progressRoundingError + 2 * arithmeticAllowance) {
		throw new RangeError('The interpolation-error budget must exceed the endpoint-residual and rounding budgets');
	}
	if (source.accuracy.maxInterpolationError * source.accuracy.maxTravelPx >= 1) {
		throw new RangeError('The interpolation-error limit must be subpixel at maxTravelPx');
	}
	if (!Array.isArray(source.presets) || source.presets.length !== 2) {
		throw new RangeError('source.presets must contain exactly the responsive and settled candidates');
	}
	const ids = new Set();
	for (const preset of source.presets) {
		requireRecord(preset, ['id', 'label', 'sourcePreset', 'frequencyHz', 'dampingRatio', 'mass'], 'preset');
		if (!['responsive', 'settled'].includes(preset.id) || ids.has(preset.id)) {
			throw new RangeError('Each candidate id must be unique and either responsive or settled');
		}
		ids.add(preset.id);
		requireText(preset.label, `${preset.id}.label`);
		if (!['instant', 'precise'].includes(preset.sourcePreset)) {
			throw new RangeError(`${preset.id}.sourcePreset must be instant or precise`);
		}
		requireNumber(preset.frequencyHz, 0.1, 100, `${preset.id}.frequencyHz`);
		if (preset.dampingRatio !== 1 || preset.mass !== 1) {
			throw new RangeError(`${preset.id} must be critically damped with unit mass (dampingRatio = mass = 1)`);
		}
	}
}

function remainingAt(normalizedTime) {
	return (1 + normalizedTime) * Math.exp(-normalizedTime);
}

function positionAt(normalizedTime) {
	return -Math.expm1(-normalizedTime) - normalizedTime * Math.exp(-normalizedTime);
}

/** Evaluates a unit critical step from position zero and zero initial velocity; time is in seconds. */
export function evaluateCriticalResponse(frequencyHz, timeSeconds) {
	requireNumber(frequencyHz, 0.1, 100, 'frequencyHz');
	requireNumber(timeSeconds, 0, 60, 'timeSeconds');
	const omega = 2 * Math.PI * frequencyHz;
	const normalizedTime = omega * timeSeconds;
	const decay = Math.exp(-normalizedTime);
	return {
		position: positionAt(normalizedTime),
		remaining: remainingAt(normalizedTime),
		speed: omega * normalizedTime * decay,
	};
}

function normalizedTimeForRemaining(remaining) {
	let lower = 0;
	let upper = 64;
	for (let iteration = 0; iteration < 80; iteration++) {
		const middle = (lower + upper) / 2;
		if (remainingAt(middle) > remaining) {
			lower = middle;
		} else {
			upper = middle;
		}
	}
	return upper;
}

/** Monotone critical responses never leave a remaining-distance band after entering it. */
export function timeForRemaining(frequencyHz, remaining) {
	requireNumber(frequencyHz, 0.1, 100, 'frequencyHz');
	requireNumber(remaining, 1e-12, 1 - Number.EPSILON, 'remaining');
	return normalizedTimeForRemaining(remaining) / (2 * Math.PI * frequencyHz);
}

function round(value, decimalPlaces) {
	return Number(value.toFixed(decimalPlaces));
}

function roundBoundUp(value) {
	return Math.ceil(value * 1e12) / 1e12;
}

function derivePreset(preset, source) {
	const omega = 2 * Math.PI * preset.frequencyHz;
	// Solve and sample dimensionless time first: frequency scales duration, never the normalized CSS shape.
	const normalizedDuration = normalizedTimeForRemaining(source.accuracy.maxEndpointResidual - arithmeticAllowance);
	const durationMs = normalizedDuration * 1000 / omega;
	const durationSeconds = durationMs / 1000;
	const endpointResidual = remainingAt(normalizedDuration);
	const errorBudget = source.accuracy.maxInterpolationError - endpointResidual - progressRoundingError - 2 * arithmeticAllowance;
	// For p(u) = 1 - (1 + u)e^-u, |p''(u)| <= 1, so a chord's error is at most h²/8.
	const segmentCount = Math.ceil(normalizedDuration / Math.sqrt(8 * errorBudget));
	if (segmentCount + 1 > maxSamples) {
		throw new RangeError(`${preset.id} requires ${segmentCount + 1} samples, exceeding the ${maxSamples}-sample limit`);
	}
	const samples = Array.from({ length: segmentCount + 1 }, (_, index) =>
		index === segmentCount ? 1 : round(positionAt(normalizedDuration * index / segmentCount), progressDecimalPlaces)
	);
	const maxInterpolationError = roundBoundUp((normalizedDuration / segmentCount) ** 2 / 8 + endpointResidual + progressRoundingError + arithmeticAllowance);
	if (endpointResidual > source.accuracy.maxEndpointResidual || maxInterpolationError > source.accuracy.maxInterpolationError) {
		throw new RangeError(`${preset.id} cannot meet the declared accuracy limits`);
	}
	for (let index = 0; index < samples.length; index++) {
		if (!Number.isFinite(samples[index]) || samples[index] < 0 || samples[index] > 1 || (index > 0 && samples[index] < samples[index - 1])) {
			throw new RangeError(`${preset.id} produced a non-finite, non-monotone, or out-of-range CSS sample`);
		}
	}
	const segmentSeconds = durationSeconds / segmentCount;
	const cssSpeeds = samples.slice(1).map((value, index) => (value - samples[index]) / segmentSeconds);
	return {
		id: preset.id,
		label: preset.label,
		status: 'candidate',
		scope: 'rest-to-rest',
		source: {
			...source.source,
			preset: preset.sourcePreset,
			adaptation: 'frequency-and-damping-seeds-only',
		},
		frequencyHz: preset.frequencyHz,
		dampingRatio: preset.dampingRatio,
		mass: preset.mass,
		durationMs,
		easing: `linear(${samples.join(', ')})`,
		limits: { ...source.accuracy },
		metrics: {
			method: 'analytic-critical-step',
			timeUnit: 'ms',
			progressUnit: 'travel-fraction',
			speedUnit: 'travel-fraction/second',
			initialPosition: 0,
			initialVelocity: 0,
			targetPosition: 1,
			response50Ms: round(timeForRemaining(preset.frequencyHz, 0.5) * 1000, 6),
			settle2PercentMs: round(timeForRemaining(preset.frequencyHz, 0.02) * 1000, 6),
			endpointResidual: roundBoundUp(endpointResidual),
			maxInterpolationError,
			interpolationErrorMethod: 'second-derivative-bound-including-endpoint-adjustment-and-rounding',
			peakSpeed: round(omega / Math.E, 9),
			analyticTerminalSpeed: round(omega * normalizedDuration * Math.exp(-normalizedDuration), 9),
			cssPeakSpeed: round(Math.max(...cssSpeeds), 9),
			cssInitialSpeed: round(cssSpeeds[0], 9),
			cssTerminalSpeed: round(cssSpeeds[cssSpeeds.length - 1], 9),
			sampleCount: samples.length,
		},
	};
}

/** Derives finite rest-to-rest candidates without I/O, integration, or runtime animation state. */
export function deriveMotionResponses(source) {
	validateSource(source);
	return source.presets.map(preset => derivePreset(preset, source));
}

function quote(value) {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\$&').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}'`;
}

function renderValue(value, depth) {
	if (typeof value === 'string') {
		return quote(value);
	}
	if (typeof value === 'number') {
		return String(value);
	}
	const indentation = '\t'.repeat(depth);
	return `{\n${Object.entries(value).map(([key, child]) => {
		const rendered = key === 'label'
			? `localize(${quote(`motion.response.${value.id}`)}, ${JSON.stringify(child)})`
			: renderValue(child, depth + 1);
		return `${indentation}\t${key}: ${rendered},`;
	}).join('\n')}\n${indentation}}`;
}

/** The digest preserves UTF-8 source formatting except checkout-specific CRLF line endings. */
export function generateMotionResponses(sourceText) {
	if (typeof sourceText !== 'string' || Buffer.byteLength(sourceText, 'utf8') > 65536) {
		throw new TypeError('The motion response source must be UTF-8 JSON text of at most 65536 bytes');
	}
	sourceText = sourceText.replace(/\r\n/g, '\n');
	let source;
	try {
		source = JSON.parse(sourceText);
	} catch (error) {
		throw new SyntaxError(`Invalid motion response JSON: ${error.message}`);
	}
	const presets = deriveMotionResponses(source);
	const digest = `sha256:${createHash('sha256').update(sourceText, 'utf8').digest('hex')}`;
	return `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Generated from motionResponsePresets.json. Do not edit by hand.
// Regenerate: ${regenerateCommand}
// Check: ${regenerateCommand} --check

import { localize } from '../../../../nls.js';

export const motionResponseSourceDigest = ${quote(digest)};

/**
 * Candidate unit steps from rest, not live momentum-preserving responses or promoted product defaults.
 * Dimensionless sampling gives equal shapes at different frequencies; the forced final CSS endpoint does not preserve terminal velocity.
 */
export const motionResponsePresets = [
${presets.map(preset => `\t${renderValue(preset, 1)},`).join('\n')}
] as const;

export type MotionResponsePresetId = typeof motionResponsePresets[number]['id'];
export type MotionResponsePreset = typeof motionResponsePresets[number];
`;
}

/** Only the fixed generated module is writable; --check never writes, including on missing or stale output. */
export async function runCli(args, io = { readFile, writeFile }) {
	if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
		throw new Error(`Usage: ${regenerateCommand} [--check]`);
	}
	const generated = generateMotionResponses(await io.readFile(sourceUrl, 'utf8'));
	if (args[0] === '--check') {
		let actual;
		try {
			actual = await io.readFile(outputUrl, 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error;
			}
		}
		if (actual === undefined || actual.replace(/\r\n/g, '\n') !== generated) {
			throw new Error(`motionResponses.ts is missing or stale. Run: ${regenerateCommand}`);
		}
		return 'motionResponses.ts is current';
	}
	await io.writeFile(outputUrl, generated, 'utf8');
	return 'Generated src/vs/platform/theme/common/motion/motionResponses.ts';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		console.log(await runCli(process.argv.slice(2)));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
