/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ApplicationService, getProductVersion, JSONValue } from './application';

const rootPath = path.join(__dirname, '..', '..', '..');
const artifactRootPath = path.join(rootPath, '.build', 'vscode-playwright-mcp');
const evidenceRootPath = path.join(artifactRootPath, 'evidence');
const logsRootPath = path.join(artifactRootPath, 'logs');
const qualityNames = ['Dev', 'Insiders', 'Stable', 'Exploration', 'OSS'];

type StepStatus = 'started' | 'passed' | 'failed' | 'skipped';
type RunOutcome = 'passed' | 'failed' | 'aborted';
const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() => z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.array(jsonValueSchema),
	z.record(z.string(), jsonValueSchema)
]));

interface EvidenceCapture {
	status: StepStatus;
	timestamp: string;
	screenshot: string;
	windowUrl: string;
	details?: string;
}

interface EvidenceStep {
	id: string;
	title: string;
	captures: EvidenceCapture[];
}

interface LogFileSnapshot {
	size: number;
	mtimeMs: number;
}

interface EvidenceRun {
	id: string;
	state: 'initializing' | 'active' | 'capturing' | 'finishing';
	scenarioId: string;
	title: string;
	source?: string;
	scenarioPath?: string;
	workspacePath?: string;
	startedAt: string;
	completedAt?: string;
	outcome?: RunOutcome;
	notes?: string;
	runPath: string;
	videos: Set<{ saveAs(path: string): Promise<void> }>;
	pageListener?: (page: Page) => void;
	logFilesBefore: Map<string, LogFileSnapshot>;
	releaseProfileCleanup: () => void;
	artifacts: {
		report?: string;
		videos: string[];
		logs: string[];
		finalizationError?: string;
	};
	environment: {
		platform: NodeJS.Platform;
		architecture: string;
		nodeVersion: string;
		vscodeVersion: string;
		quality: string;
		commit?: string;
	};
	steps: EvidenceStep[];
}

export class EvidenceService {
	private currentRun: EvidenceRun | undefined;

	constructor(private readonly appService: ApplicationService) { }

	async start(scenarioId: string, title: string, source?: string, scenarioPath?: string, workspacePath?: string, userSettings?: Record<string, JSONValue>, extraArgs?: string[]): Promise<string> {
		if (this.currentRun) {
			throw new Error(`Evidence run '${this.currentRun.id}' is already active.`);
		}
		if (this.appService.application) {
			throw new Error('Stop the existing VS Code instance before starting evidence capture so video recording can be enabled at launch.');
		}
		if (source && !isHttpUrl(source)) {
			throw new Error(`Evidence source must use HTTP or HTTPS: '${source}'.`);
		}

		const startedAt = new Date().toISOString();
		const id = `${sanitizePathSegment(scenarioId)}-${startedAt.replace(/[:.]/g, '-')}`;
		const runPath = path.join(evidenceRootPath, id);
		fs.mkdirSync(runPath, { recursive: true });

		const logFilesBefore = new Map<string, LogFileSnapshot>(listFiles(logsRootPath).map(file => {
			const stat = fs.statSync(file);
			return [file, { size: stat.size, mtimeMs: stat.mtimeMs }];
		}));
		let releaseProfileCleanup!: () => void;
		const profileCleanupReady = new Promise<void>(resolve => releaseProfileCleanup = resolve);
		this.appService.deferProfileCleanup(profileCleanupReady);
		const run: EvidenceRun = {
			id,
			state: 'initializing',
			scenarioId,
			title,
			source,
			scenarioPath,
			workspacePath,
			startedAt,
			runPath,
			videos: new Set(),
			logFilesBefore,
			releaseProfileCleanup,
			artifacts: { videos: [], logs: [] },
			environment: {
				platform: process.platform,
				architecture: process.arch,
				nodeVersion: process.version,
				vscodeVersion: getProductVersion(),
				quality: 'unknown',
				commit: process.env.GITHUB_SHA ?? process.env.BUILD_SOURCEVERSION
			},
			steps: []
		};
		this.currentRun = run;
		let app: Awaited<ReturnType<ApplicationService['getOrCreateApplication']>>;
		try {
			app = await this.appService.getOrCreateApplication({ recordVideo: true, workspacePath, userSettings, extraArgs });
		} catch (error) {
			if (this.currentRun === run) {
				this.currentRun = undefined;
			}
			releaseProfileCleanup();
			await this.appService.waitForProfileCleanup();
			throw error;
		}
		run.environment.quality = qualityNames[app.quality] ?? String(app.quality);
		try {
			run.pageListener = page => {
				const video = page.video();
				if (video) {
					run.videos.add(video);
				}
			};
			for (const page of app.code.driver.getAllWindows()) {
				run.pageListener(page);
			}
			app.code.driver.browserContext.on('page', run.pageListener);

			await app.startTracing();
			await this.showOverlay('Scenario', title, 'started');
			await wait(500);
			await this.capture('00-scenario-started.png');
			this.writeManifest();
			run.state = 'active';

			return runPath;
		} catch (error) {
			try {
				if (run.pageListener) {
					app.code?.driver.browserContext.off('page', run.pageListener);
				}
			} catch {
				// Preserve the startup error.
			}
			try {
				await app.stopTracing(undefined, true);
				await this.appService.stopApplication(app);
			} catch {
				// Preserve the startup error.
			} finally {
				this.currentRun = undefined;
				run.releaseProfileCleanup();
				await this.appService.waitForProfileCleanup();
			}
			throw error;
		}
	}

	async step(id: string, title: string, status: StepStatus, details?: string): Promise<{ screenshot: Buffer; screenshotPath: string }> {
		const run = this.requireRun();
		if (run.state !== 'active') {
			throw new Error(`Evidence run '${run.id}' is busy (${run.state}).`);
		}
		let step = run.steps.find(candidate => candidate.id === id);

		let isNewStep = false;
		if (status === 'started') {
			if (step) {
				throw new Error(`Step '${id}' has already started.`);
			}
			const activeStep = run.steps.find(candidate => candidate.captures.at(-1)?.status === 'started');
			if (activeStep) {
				throw new Error(`Step '${activeStep.id}' is still active. Mark it passed or failed before starting '${id}'.`);
			}
			step = { id, title, captures: [] };
			run.steps.push(step);
			isNewStep = true;
		} else if (!step && status === 'skipped') {
			const activeStep = run.steps.find(candidate => candidate.captures.at(-1)?.status === 'started');
			if (activeStep) {
				throw new Error(`Step '${activeStep.id}' is still active. Complete it before skipping '${id}'.`);
			}
			step = { id, title, captures: [] };
			run.steps.push(step);
			isNewStep = true;
		} else if (!step || step.captures.at(-1)?.status !== 'started') {
			throw new Error(`Step '${id}' must be started before it can be marked '${status}'.`);
		}

		run.state = 'capturing';
		let screenshotName: string | undefined;
		try {
			let app = await this.appService.getApplicationIfRunning();
			if (!app) {
				throw new Error('VS Code is not running. Finish the evidence run as aborted or failed.');
			}
			run.pageListener?.(app.code.driver.currentPage);
			let screenshot: Buffer | undefined;
			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					await this.showOverlay(id, title, status);
					await wait(status === 'started' ? 500 : 250);
					const sequence = String(run.steps.indexOf(step) + 1).padStart(2, '0');
					screenshotName = `${sequence}-${sanitizePathSegment(id)}-${status}.png`;
					screenshot = await this.capture(screenshotName);
					break;
				} catch (error) {
					app = await this.appService.getApplicationIfRunning();
					if (!app || attempt === 1) {
						throw error;
					}
					run.pageListener?.(app.code.driver.currentPage);
				}
			}
			if (!screenshot || !screenshotName) {
				throw new Error(`Failed to capture evidence for step '${id}'.`);
			}
			step.captures.push({
				status,
				timestamp: new Date().toISOString(),
				screenshot: screenshotName,
				windowUrl: app.code.driver.currentPage.url(),
				details
			});
			this.writeManifest();

			return { screenshot, screenshotPath: path.join(run.runPath, screenshotName) };
		} catch (error) {
			if (isNewStep && !step.captures.length) {
				run.steps.splice(run.steps.indexOf(step), 1);
				if (screenshotName) {
					try {
						fs.rmSync(path.join(run.runPath, screenshotName), { force: true });
					} catch {
						// Preserve the capture error.
					}
				}
			}
			throw error;
		} finally {
			if (this.currentRun === run && run.state === 'capturing') {
				run.state = 'active';
			}
		}
	}

	async finish(outcome: RunOutcome, notes?: string): Promise<string> {
		const run = this.requireRun();
		if (run.state !== 'active') {
			throw new Error(`Evidence run '${run.id}' is busy (${run.state}).`);
		}
		const activeStep = run.steps.find(candidate => candidate.captures.at(-1)?.status === 'started');
		if (activeStep && outcome !== 'aborted') {
			throw new Error(`Step '${activeStep.id}' is still active. Complete it before finishing the run.`);
		}
		const failedStep = run.steps.find(candidate => candidate.captures.at(-1)?.status === 'failed');
		if (failedStep && outcome === 'passed') {
			outcome = 'failed';
			notes = [notes, `Run marked failed because step '${failedStep.id}' failed.`].filter(Boolean).join('\n');
		}
		run.state = 'finishing';

		try {
			let app = await this.appService.getApplicationIfRunning();
			const recordApplicationClosure = () => {
				outcome = outcome === 'passed' ? 'failed' : outcome;
				const closureNote = 'VS Code closed before evidence capture was finalized.';
				if (!notes?.includes(closureNote)) {
					notes = [notes, closureNote].filter(Boolean).join('\n');
				}
			};
			if (app) {
				for (let attempt = 0; attempt < 2; attempt++) {
					try {
						await this.showOverlay('Result', run.title, outcome);
						await wait(500);
						await this.capture(`99-result-${outcome}.png`);
						break;
					} catch (error) {
						app = await this.appService.getApplicationIfRunning();
						if (!app) {
							recordApplicationClosure();
							break;
						}
						if (attempt === 1) {
							throw error;
						}
					}
				}
			} else {
				recordApplicationClosure();
			}

			run.completedAt = new Date().toISOString();
			run.outcome = outcome;
			run.notes = notes;
			this.writeManifest();

			if (app) {
				try {
					for (const page of app.code.driver.getAllWindows()) {
						run.pageListener?.(page);
					}
					await app.stopTracing(undefined, true);
					await this.appService.stopApplication(app);
				} catch (error) {
					if (await this.appService.getApplicationIfRunning()) {
						throw error;
					}
					app = undefined;
					recordApplicationClosure();
					run.outcome = outcome;
					run.notes = notes;
					this.writeManifest();
				}
			}

			await this.saveVideo();
			this.copyLogArtifacts();
			const reportPath = this.writeReport();
			run.artifacts.report = path.relative(run.runPath, reportPath).replaceAll(path.sep, '/');
			this.writeManifest();
			return reportPath;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			run.completedAt ??= new Date().toISOString();
			run.outcome = 'failed';
			run.artifacts.finalizationError = message;
			run.notes = [notes, `Evidence finalization failed: ${message}`].filter(Boolean).join('\n');
			try {
				this.writeManifest();
			} catch {
				// Preserve the original finalization error.
			}
			throw error;
		} finally {
			const app = this.appService.application;
			if (app && run.pageListener) {
				app.code.driver.browserContext.off('page', run.pageListener);
			}
			try {
				if (app) {
					await app.stopTracing(undefined, true);
					await this.appService.stopApplication(app);
				}
			} catch {
				// Preserve the primary result or finalization error.
			}
			this.currentRun = undefined;
			run.releaseProfileCleanup();
			await this.appService.waitForProfileCleanup();
		}
	}

	private requireRun(): EvidenceRun {
		if (!this.currentRun) {
			throw new Error('No evidence run is active. Start one with vscode_automation_evidence_start.');
		}
		return this.currentRun;
	}

	private async showOverlay(id: string, title: string, status: string): Promise<void> {
		if (process.env.VSCODE_EVIDENCE_CLEAN_CAPTURE === '1') {
			// The overlay is appended to the DOM of the product under test, so it can
			// shift layout and influence focus or selectors. Callers that annotate the
			// recording afterwards opt out to keep the capture faithful.
			return;
		}
		const app = this.appService.application;
		if (!app) {
			throw new Error('VS Code is not running.');
		}
		const values = JSON.stringify({ id, title, status });
		await app.code.driver.evaluateExpression(`(() => {
			const values = ${values};
			let overlay = document.getElementById('vscode-ui-evidence-overlay');
			if (!overlay) {
				overlay = document.createElement('div');
				overlay.id = 'vscode-ui-evidence-overlay';
				overlay.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:70vw;padding:10px 16px;border-radius:6px;background:rgba(0,0,0,.88);color:#fff;font:600 14px/1.4 system-ui;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none;text-align:center';
				document.documentElement.appendChild(overlay);
			}
			overlay.textContent = values.id + ': ' + values.title + ' [' + values.status.toUpperCase() + ']';
			overlay.dataset.status = values.status;
			return overlay.textContent;
		})()`);
	}

	private async capture(name: string): Promise<Buffer> {
		const run = this.requireRun();
		const app = this.appService.application;
		if (!app) {
			throw new Error('VS Code is not running.');
		}
		const screenshot = await app.code.driver.screenshotBuffer(false);
		fs.writeFileSync(path.join(run.runPath, name), screenshot);
		return screenshot;
	}

	private async saveVideo(): Promise<void> {
		const run = this.requireRun();
		if (!run.videos.size) {
			return;
		}
		let index = 0;
		for (const video of run.videos) {
			const relativePath = `videos/recording-${++index}.webm`;
			const destination = path.join(run.runPath, relativePath);
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			await video.saveAs(destination);
			run.artifacts.videos.push(relativePath);
		}
	}

	private copyLogArtifacts(): void {
		const run = this.requireRun();
		for (const file of listFiles(logsRootPath)) {
			const previous = run.logFilesBefore.get(file);
			const stat = fs.statSync(file);
			const contents = fs.readFileSync(file);
			const wasReplacedArchive = path.extname(file).toLowerCase() === '.zip' && previous?.mtimeMs !== stat.mtimeMs;
			const offset = wasReplacedArchive ? 0 : previous?.size ?? 0;
			if (contents.length <= offset) {
				continue;
			}
			const relativeSource = path.relative(logsRootPath, file);
			const relativeDestination = path.join('logs', relativeSource);
			const destination = path.join(run.runPath, relativeDestination);
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, contents.subarray(offset));
			run.artifacts.logs.push(relativeDestination.replaceAll(path.sep, '/'));
		}
	}

	private writeManifest(): void {
		const run = this.requireRun();
		const manifest = {
			id: run.id,
			scenarioId: run.scenarioId,
			title: run.title,
			source: run.source,
			scenarioPath: run.scenarioPath,
			workspacePath: run.workspacePath,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
			outcome: run.outcome,
			notes: run.notes,
			environment: run.environment,
			artifacts: run.artifacts,
			steps: run.steps
		};
		fs.writeFileSync(path.join(run.runPath, 'manifest.json'), JSON.stringify(manifest, undefined, 2));
	}

	private writeReport(): string {
		const run = this.requireRun();
		const rows = run.steps.map(step => {
			const result = step.captures.at(-1);
			const screenshots = step.captures.map(capture => `<a href="${escapeHtml(capture.screenshot)}">${escapeHtml(capture.status)}</a>`).join(', ');
			return `<tr><td>${escapeHtml(step.id)}</td><td>${escapeHtml(step.title)}</td><td>${escapeHtml(result?.status ?? 'unknown')}</td><td>${screenshots}</td><td>${escapeHtml(result?.details ?? '')}</td></tr>`;
		}).join('');
		const videoElements = run.artifacts.videos.length
			? run.artifacts.videos.map(video => `<video controls src="${escapeHtml(video)}"></video>`).join('')
			: '<p>No video file was produced.</p>';
		const logs = run.artifacts.logs.map(log => `<li><a href="${escapeHtml(log)}">${escapeHtml(log)}</a></li>`).join('');
		const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(run.title)}</title>
<style>body{font:14px system-ui;margin:32px;max-width:1200px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}video{display:block;max-width:100%;margin:16px 0}.passed{color:#187b34}.failed{color:#b42318}</style></head>
<body><h1>${escapeHtml(run.title)}</h1><p><strong>Scenario:</strong> ${escapeHtml(run.scenarioId)}<br><strong>Outcome:</strong> <span class="${escapeHtml(run.outcome ?? '')}">${escapeHtml(run.outcome ?? 'unknown')}</span><br><strong>Started:</strong> ${escapeHtml(run.startedAt)}<br><strong>Completed:</strong> ${escapeHtml(run.completedAt ?? '')}</p>
<p><strong>Source:</strong> ${run.source ? `<a href="${escapeHtml(run.source)}">${escapeHtml(run.source)}</a>` : 'Not recorded'}<br><strong>Workspace:</strong> ${escapeHtml(run.workspacePath ?? 'Not specified')}<br><strong>Environment:</strong> ${escapeHtml(`${run.environment.platform} ${run.environment.architecture}; VS Code ${run.environment.vscodeVersion} (${run.environment.quality}); Node ${run.environment.nodeVersion}; commit ${run.environment.commit ?? 'unknown'}`)}</p>
<p>${escapeHtml(run.notes ?? '')}</p><h2>Steps</h2><table><thead><tr><th>ID</th><th>Title</th><th>Result</th><th>Screenshots</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Video</h2>${videoElements}<h2>Trace and logs</h2>${logs ? `<ul>${logs}</ul>` : '<p>No new trace or log content was produced.</p>'}</body></html>`;
		const reportPath = path.join(run.runPath, 'report.html');
		fs.writeFileSync(reportPath, html);
		return reportPath;
	}

}

export function applyEvidenceStartTool(server: McpServer, evidenceService: EvidenceService): RegisteredTool {
	return server.tool(
		'vscode_automation_evidence_start',
		'Start VS Code with video and trace recording for a UI validation scenario',
		{
			scenarioId: z.string().describe('Stable scenario identifier'),
			title: z.string().describe('Human-readable scenario title'),
			source: z.string().url().refine(isHttpUrl, 'Source must use HTTP or HTTPS').optional().describe('Source test-plan issue URL'),
			scenarioPath: z.string().optional().describe('Path to the Markdown scenario definition'),
			workspacePath: z.string().optional().describe('Workspace or folder to open'),
			userSettings: z.record(z.string(), jsonValueSchema).optional().describe('User settings to seed before VS Code starts'),
			extraArgs: z.array(z.string()).optional().describe('Additional VS Code command-line arguments')
		},
		async ({ scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs }) => {
			const runPath = await evidenceService.start(scenarioId, title, source, scenarioPath, workspacePath, userSettings, extraArgs);
			return {
				content: [{ type: 'text' as const, text: `Evidence capture started: ${runPath}` }]
			};
		}
	);
}

export function applyEvidenceTools(server: McpServer, evidenceService: EvidenceService): RegisteredTool[] {
	return [
		server.tool(
			'vscode_automation_evidence_step',
			'Mark a scenario step in the video and save a screenshot of the current VS Code window',
			{
				id: z.string().describe('Stable step identifier from the scenario'),
				title: z.string().describe('Human-readable step title'),
				status: z.enum(['started', 'passed', 'failed', 'skipped']).describe('Step lifecycle status'),
				details: z.string().optional().describe('Validation result or failure details')
			},
			async ({ id, title, status, details }) => {
				const result = await evidenceService.step(id, title, status, details);
				return {
					content: [
						{ type: 'text' as const, text: `Evidence saved: ${result.screenshotPath}` },
						{ type: 'image' as const, data: result.screenshot.toString('base64'), mimeType: 'image/png' }
					]
				};
			}
		),
		server.tool(
			'vscode_automation_evidence_finish',
			'Finish a UI validation scenario, stop VS Code, and write the evidence report',
			{
				outcome: z.enum(['passed', 'failed', 'aborted']).describe('Overall scenario outcome'),
				notes: z.string().optional().describe('Run summary or blocking condition')
			},
			async ({ outcome, notes }) => {
				const reportPath = await evidenceService.finish(outcome, notes);
				return {
					content: [{ type: 'text' as const, text: `Evidence report written: ${reportPath}` }]
				};
			}
		)
	];
}

function sanitizePathSegment(value: string): string {
	const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	return sanitized || 'unnamed';
}

function listFiles(directory: string): string[] {
	if (!fs.existsSync(directory)) {
		return [];
	}
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
	});
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

function wait(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isHttpUrl(value: string): boolean {
	try {
		const protocol = new URL(value).protocol;
		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}
