/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Composes chapter cards onto an evidence recording.
//
// Step titles are rendered onto the video *after* the run instead of being drawn
// into the window while it is recorded, so the capture shows unmodified product
// UI. Cards are inserted between segments rather than overlaid, so no recorded
// frame is ever hidden.
//
// Usage: node render-evidence-chapters.mjs <evidence-run-directory>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
const fontCandidates = process.env.CHAPTER_FONT ? [process.env.CHAPTER_FONT] : [
	'/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
	'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
	'/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
	'/System/Library/Fonts/Supplemental/Arial Bold.ttf',
	'C:/Windows/Fonts/arialbd.ttf'
];

try {
	render(path.resolve(process.argv[2] ?? process.env.RUN_ROOT ?? '.'));
} catch (error) {
	// Chapters are a presentation aid, so never fail a validation run because the
	// recording could not be annotated. The raw recording remains authoritative.
	console.warn(`Unable to render evidence chapters: ${error instanceof Error ? error.message : error}`);
}

function render(runRoot) {
	const manifestPath = path.join(runRoot, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const videoStartedAtMs = Date.parse(manifest.videoStartedAt ?? '');
	const relativeVideo = (manifest.artifacts?.videos ?? []).find(video => /\.webm$/iu.test(video));

	if (!relativeVideo) {
		console.log('No recorded video is available, so no chapters were rendered.');
		return;
	}
	if (!Number.isFinite(videoStartedAtMs)) {
		console.log('The run has no video start time, so chapters cannot be aligned.');
		return;
	}
	const font = fontCandidates.find(candidate => fs.existsSync(candidate));
	if (!font) {
		console.log('No usable font was found, so no chapters were rendered.');
		return;
	}

	const videoPath = path.join(runRoot, relativeVideo);
	const outputRelative = 'videos/annotated.mp4';
	const outputPath = path.join(runRoot, outputRelative);
	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-evidence-chapters-'));
	// Filters run from workDir with relative file names so no path escaping
	// (drive letters, colons, backslashes) can corrupt the filter description.
	fs.copyFileSync(font, path.join(workDir, 'font.ttf'));

	try {
		const probe = JSON.parse(execFileSync(ffprobe, [
			'-v', 'error',
			'-select_streams', 'v:0',
			'-show_entries', 'stream=width,height',
			'-show_entries', 'format=duration',
			'-of', 'json',
			videoPath
		], { encoding: 'utf8' }));
		const width = Number(probe.streams?.[0]?.width);
		const height = Number(probe.streams?.[0]?.height);
		const duration = Number(probe.format?.duration);
		if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isFinite(duration) || duration <= 0) {
			throw new Error('the recorded video could not be probed');
		}

		const boundaries = [];
		let previous = 0;
		for (const step of manifest.steps ?? []) {
			const started = step.captures?.find(capture => capture.status === 'started') ?? step.captures?.[0];
			const offset = (Date.parse(started?.timestamp ?? '') - videoStartedAtMs) / 1000;
			if (!Number.isFinite(offset)) {
				continue;
			}
			const at = Math.min(Math.max(offset, previous), duration);
			boundaries.push({ step, at });
			previous = at;
		}

		const inputs = ['-i', videoPath];
		const filters = [];
		const concat = [];
		let inputIndex = 1;
		let textIndex = 0;

		addCard('CHAPTERED VALIDATION EVIDENCE', manifest.title ?? 'UI validation', `${manifest.scenarioId ?? ''} - outcome: ${manifest.outcome ?? 'unknown'}`, 3);
		if (boundaries.length === 0 || boundaries[0].at > 0.05) {
			addSegment(0, boundaries.length ? boundaries[0].at : duration);
		}
		boundaries.forEach((boundary, index) => {
			const step = boundary.step;
			addCard(
				`STEP ${index + 1} OF ${boundaries.length} - ${String(step.id ?? '').toUpperCase()}`,
				step.title ?? '',
				step.captures?.[0]?.details ?? '',
				2.5,
				step.captures?.at(-1)?.status
			);
			addSegment(boundary.at, index + 1 < boundaries.length ? boundaries[index + 1].at : duration);
		});

		if (concat.length < 2) {
			console.log('No chapter boundaries were derived, so no chapters were rendered.');
			return;
		}

		filters.push(`${concat.join('')}concat=n=${concat.length}:v=1:a=0[out]`);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		execFileSync(ffmpeg, [
			'-y', '-hide_banner', '-loglevel', 'error',
			...inputs,
			'-filter_complex', filters.join(';'),
			'-map', '[out]',
			'-an',
			'-c:v', 'libx264',
			'-preset', 'veryfast',
			'-crf', '30',
			'-pix_fmt', 'yuv420p',
			'-movflags', '+faststart',
			outputPath
		], { cwd: workDir, stdio: ['ignore', 'inherit', 'inherit'] });

		manifest.artifacts.videos = [...new Set([outputRelative, ...manifest.artifacts.videos])];
		fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
		console.log(`Rendered ${boundaries.length} step chapters into ${outputRelative}`);

		function addSegment(from, to) {
			if (!(to > from + 0.05)) {
				return;
			}
			const label = `v${concat.length}`;
			filters.push(`[0:v]trim=start=${from.toFixed(3)}:end=${to.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=${width}:${height},setsar=1,format=yuv420p[${label}]`);
			concat.push(`[${label}]`);
		}

		function addCard(eyebrow, title, subtitle, seconds, status) {
			const label = `v${concat.length}`;
			inputs.push('-f', 'lavfi', '-t', String(seconds), '-i', `color=c=0x0D1117:s=${width}x${height}:r=30`);
			const accent = status === 'failed' ? '0xF85149' : status === 'passed' ? '0x3FB950' : '0x58A6FF';
			const eyebrowSize = Math.max(14, Math.round(height * 0.026));
			const titleSize = Math.max(20, Math.round(height * 0.052));
			const subtitleSize = Math.max(13, Math.round(height * 0.024));
			const parts = [];
			let y = Math.round(height * 0.34);
			y += push(drawText(eyebrow, eyebrowSize, y, accent, 62), eyebrowSize) + Math.round(height * 0.03);
			y += push(drawText(title, titleSize, y, '0xFFFFFF', 44), titleSize) + Math.round(height * 0.035);
			push(drawText(subtitle, subtitleSize, y, '0xC9D1D9', 76), subtitleSize);
			filters.push(`[${inputIndex}:v]${parts.join(',')},setsar=1,format=yuv420p[${label}]`);
			concat.push(`[${label}]`);
			inputIndex++;

			function push(drawn, size) {
				if (drawn.filter) {
					parts.push(drawn.filter);
				}
				return Math.round(drawn.lines * size * 1.4);
			}
		}

		function drawText(value, size, y, color, wrapAt) {
			const text = wrap(String(value ?? '').trim(), wrapAt);
			if (!text) {
				return { filter: '', lines: 0 };
			}
			const name = `text-${textIndex++}.txt`;
			fs.writeFileSync(path.join(workDir, name), text);
			return {
				filter: `drawtext=fontfile=font.ttf:textfile=${name}:fontcolor=${color}:fontsize=${size}:line_spacing=${Math.round(size * 0.4)}:x=(w-text_w)/2:y=${y}`,
				lines: text.split('\n').length
			};
		}
	} finally {
		fs.rmSync(workDir, { recursive: true, force: true });
	}
}

function wrap(value, limit) {
	const lines = [];
	let line = '';
	for (const word of value.split(/\s+/u).filter(Boolean)) {
		if (line && `${line} ${word}`.length > limit) {
			lines.push(line);
			line = word;
		} else {
			line = line ? `${line} ${word}` : word;
		}
	}
	if (line) {
		lines.push(line);
	}
	return lines.slice(0, 4).join('\n');
}
