/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Composes a caption band onto an evidence recording.
//
// Step titles and their validation results are rendered onto the video *after*
// the run instead of being drawn into the window while it is recorded, so the
// capture shows unmodified product UI.
//
// The band is added above the recorded frame rather than drawn over it, so the
// annotation costs no recorded pixels: the entire workbench stays legible, and
// the recording keeps its original length.
//
// Usage: node out/renderEvidenceChapters.js <evidence-run-directory>

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface Capture {
	status?: string;
	timestamp?: string;
	details?: string;
	blockedOn?: string;
}

interface Step {
	id?: string;
	title?: string;
	captures?: Capture[];
}

interface Manifest {
	scenarioId?: string;
	title?: string;
	outcome?: string;
	videoStartedAt?: string;
	artifacts?: { videos?: string[] };
	steps?: Step[];
}

interface Caption {
	from: number;
	to: number;
	eyebrow: string;
	title: string[];
	details: string[];
	accent: string;
}

/**
 * Locate ffmpeg or ffprobe.
 *
 * A PATH edit only reaches processes started afterwards, so ffmpeg is commonly
 * installed and still invisible to an editor that was already running. Well
 * known install locations are probed before giving up, which is the difference
 * between an annotated recording and a raw one.
 */
export function resolveVideoTool(tool: 'ffmpeg' | 'ffprobe'): string | undefined {
	const override = process.env[`${tool.toUpperCase()}_PATH`];
	const executable = process.platform === 'win32' ? `${tool}.exe` : tool;
	const candidates = override ? [override] : [tool, ...installedToolCandidates(executable)];
	for (const candidate of candidates) {
		try {
			execFileSync(candidate, ['-version'], { stdio: 'ignore' });
			return candidate;
		} catch {
			// try the next location
		}
	}
	return undefined;
}

function installedToolCandidates(executable: string): string[] {
	const candidates: string[] = [];
	if (process.platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA;
		if (localAppData) {
			candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', executable));
			// winget unpacks into Packages/<id>/<build>/bin, so the build directory
			// carries a version that cannot be hard-coded.
			const packages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
			for (const pkg of readDirectories(packages).filter(name => /ffmpeg/iu.test(name))) {
				for (const build of readDirectories(path.join(packages, pkg))) {
					candidates.push(path.join(packages, pkg, build, 'bin', executable));
				}
			}
		}
		candidates.push(
			path.join(process.env.ProgramData ?? '', 'chocolatey', 'bin', executable),
			path.join(process.env.ProgramFiles ?? '', 'ffmpeg', 'bin', executable)
		);
	} else {
		candidates.push(`/opt/homebrew/bin/${executable}`, `/usr/local/bin/${executable}`, `/usr/bin/${executable}`);
	}
	return candidates.filter(candidate => fs.existsSync(candidate));
}

function readDirectories(root: string): string[] {
	try {
		return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
	} catch {
		return [];
	}
}

const fontCandidates = process.env.CHAPTER_FONT ? [process.env.CHAPTER_FONT] : [
	'/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
	'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
	'/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
	'/System/Library/Fonts/Supplemental/Arial Bold.ttf',
	'C:/Windows/Fonts/arialbd.ttf'
];

const MAX_TITLE_LINES = 2;
const MAX_DETAIL_LINES = 3;

function accentFor(status: string | undefined): string {
	switch (status) {
		case 'passed': return '0x3FB950';
		case 'failed': return '0xF85149';
		case 'skipped': return '0xD29922';
		default: return '0x58A6FF';
	}
}

export function renderChapters(runRoot: string): void {
	const manifestPath = path.join(runRoot, 'manifest.json');
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
	const videoStartedAtMs = Date.parse(manifest.videoStartedAt ?? '');
	const videos = (manifest.artifacts?.videos ?? []).filter(video => /\.webm$/iu.test(video));
	const relativeVideo = videos[0];

	if (!relativeVideo) {
		console.log('No recorded video is available, so no captions were rendered.');
		return;
	}
	if (videos.length > 1) {
		// One recording is written per captured page. Aligning every step onto the
		// first one would silently drop the other windows from the evidence, so
		// refuse rather than publish an incomplete recording.
		console.log(`The run captured ${videos.length} recordings (one per window), which cannot be captioned onto a single timeline.`);
		return;
	}
	if (!Number.isFinite(videoStartedAtMs)) {
		console.log('The run has no video start time, so captions cannot be aligned.');
		return;
	}
	const font = fontCandidates.find(candidate => candidate && fs.existsSync(candidate));
	if (!font) {
		console.log('No usable font was found, so no captions were rendered.');
		return;
	}
	const ffmpeg = resolveVideoTool('ffmpeg');
	const ffprobe = resolveVideoTool('ffprobe');
	if (!ffmpeg || !ffprobe) {
		throw new Error(`${[!ffmpeg && 'ffmpeg', !ffprobe && 'ffprobe'].filter(Boolean).join(' and ')} could not be found`);
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
		], { encoding: 'utf8' })) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
		const width = Number(probe.streams?.[0]?.width);
		const height = Number(probe.streams?.[0]?.height);
		const duration = Number(probe.format?.duration);
		if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isFinite(duration) || duration <= 0) {
			throw new Error('the recorded video could not be probed');
		}

		const margin = Math.round(width * 0.02);
		const eyebrowSize = Math.max(12, Math.round(height * 0.020));
		const titleSize = Math.max(16, Math.round(height * 0.030));
		const detailSize = Math.max(11, Math.round(height * 0.018));
		const lineHeight = (size: number): number => Math.round(size * 1.35);
		// drawtext offers no wrapping, so lines are broken here. 0.52 approximates
		// the average glyph advance of the bundled sans fonts relative to the font
		// size, which keeps a wrapped line inside the frame without measuring it.
		const columnsFor = (size: number): number => Math.max(16, Math.floor((width - margin * 3) / (size * 0.52)));

		const boundaries: { step: Step; at: number }[] = [];
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

		if (boundaries.length === 0) {
			console.log('No step boundaries were derived, so no captions were rendered.');
			return;
		}

		const captions: Caption[] = [];
		if (boundaries[0].at > 0.05) {
			captions.push({
				from: 0,
				to: boundaries[0].at,
				eyebrow: 'UI VALIDATION EVIDENCE',
				title: wrap(manifest.title ?? 'UI validation', columnsFor(titleSize), MAX_TITLE_LINES),
				details: wrap(manifest.scenarioId ?? '', columnsFor(detailSize), 1),
				accent: accentFor(manifest.outcome)
			});
		}
		boundaries.forEach((boundary, index) => {
			const step = boundary.step;
			// The validation result is recorded on the closing capture; the opening
			// one only marks that the step started.
			const closing = step.captures?.at(-1);
			const status = closing?.status ?? 'started';
			captions.push({
				from: boundary.at,
				to: index + 1 < boundaries.length ? boundaries[index + 1].at : duration,
				eyebrow: `STEP ${index + 1} OF ${boundaries.length}   ${String(step.id ?? '').toUpperCase()}   ${status.toUpperCase()}${closing?.blockedOn ? ` - NEEDS ${closing.blockedOn.toUpperCase()}` : ''}`,
				title: wrap(step.title ?? '', columnsFor(titleSize), MAX_TITLE_LINES),
				details: wrap(closing?.details ?? '', columnsFor(detailSize), MAX_DETAIL_LINES),
				accent: accentFor(status)
			});
		});

		const titleLines = Math.max(1, ...captions.map(caption => caption.title.length));
		const detailLines = Math.max(0, ...captions.map(caption => caption.details.length));
		const gap = Math.round(height * 0.008);
		let bandHeight = margin
			+ lineHeight(eyebrowSize) + gap
			+ titleLines * lineHeight(titleSize)
			+ (detailLines ? gap + detailLines * lineHeight(detailSize) : 0)
			+ margin;
		bandHeight += bandHeight % 2; // yuv420p requires even dimensions

		const filters: string[] = [`[0:v]pad=${width}:${height + bandHeight}:0:${bandHeight}:color=0x0D1117[base]`];
		let textIndex = 0;
		let label = 'base';

		const draw = (text: string[], size: number, y: number, color: string, caption: Caption, align: 'left' | 'right'): void => {
			if (!text.length) {
				return;
			}
			const name = `text-${textIndex++}.txt`;
			fs.writeFileSync(path.join(workDir, name), text.join('\n'));
			const next = `t${textIndex}`;
			const x = align === 'right' ? `w-text_w-${margin}` : String(margin);
			filters.push(
				// Expansion is on by default even for `textfile`, which would make
				// ordinary evidence text containing `%` fail to parse. Single quotes
				// keep the commas inside `between()` from splitting the filtergraph.
				`[${label}]drawtext=fontfile=font.ttf:textfile=${name}:expansion=none` +
				`:fontcolor=${color}:fontsize=${size}:line_spacing=${Math.round(size * 0.35)}` +
				`:x=${x}:y=${y}` +
				`:enable='between(t,${caption.from.toFixed(3)},${caption.to.toFixed(3)})'[${next}]`
			);
			label = next;
		};

		const outcomeText = `outcome: ${manifest.outcome ?? 'unknown'}`;
		for (const caption of captions) {
			if (!(caption.to > caption.from + 0.05)) {
				continue;
			}
			let y = margin;
			draw([caption.eyebrow], eyebrowSize, y, caption.accent, caption, 'left');
			draw([outcomeText], eyebrowSize, y, '0x8B949E', caption, 'right');
			y += lineHeight(eyebrowSize) + gap;
			draw(caption.title, titleSize, y, '0xFFFFFF', caption, 'left');
			y += caption.title.length * lineHeight(titleSize) + gap;
			draw(caption.details, detailSize, y, '0xC9D1D9', caption, 'left');
		}

		if (label === 'base') {
			console.log('No captions could be placed on the recording.');
			return;
		}

		filters.push(`[${label}]setsar=1,format=yuv420p[out]`);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		execFileSync(ffmpeg, [
			'-y', '-hide_banner', '-loglevel', 'error',
			'-i', videoPath,
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

		manifest.artifacts!.videos = [...new Set([outputRelative, ...(manifest.artifacts?.videos ?? [])])];
		fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
		pointReportAtAnnotatedVideo(runRoot, relativeVideo, outputRelative);
		console.log(`Captioned ${boundaries.length} steps into ${outputRelative}`);
	} finally {
		fs.rmSync(workDir, { recursive: true, force: true });
	}
}

/**
 * Point the generated report at the annotated recording.
 *
 * `EvidenceService.finish()` writes `report.html` before captions exist, so the
 * report would otherwise keep showing the unannotated capture.
 */
function pointReportAtAnnotatedVideo(runRoot: string, rawVideo: string, annotatedVideo: string): void {
	const reportPath = path.join(runRoot, 'report.html');
	if (!fs.existsSync(reportPath)) {
		return;
	}
	const report = fs.readFileSync(reportPath, 'utf8');
	if (!report.includes(`src="${rawVideo}"`)) {
		return;
	}
	fs.writeFileSync(reportPath, report.replace(`src="${rawVideo}"`, `src="${annotatedVideo}"`));
}

function wrap(value: string, limit: number, maxLines: number): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of String(value ?? '').trim().split(/\s+/u).filter(Boolean)) {
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
	if (lines.length > maxLines) {
		// Keep the band a fixed height: a long validation detail is truncated here
		// and remains available in full in `manifest.json` and `report.html`.
		const kept = lines.slice(0, maxLines);
		kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/u, '')}...`;
		return kept;
	}
	return lines;
}

/**
 * Render captions without letting a presentation step fail a validation run.
 *
 * The raw recording is authoritative, so a missing or failing ffmpeg is reported
 * and otherwise ignored.
 */
export function tryRenderChapters(runRoot: string): void {
	try {
		renderChapters(runRoot);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Unable to render evidence captions: ${message}. The raw recording is unaffected.`);
	}
}

if (require.main === module) {
	tryRenderChapters(path.resolve(process.argv[2] ?? process.env.RUN_ROOT ?? '.'));
}
