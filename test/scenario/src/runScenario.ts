/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Page } from '@playwright/test';
import * as path from 'path';
import type { Application, Code, Workbench } from '../../automation';
import { ApplicationService, JSONValue } from './application';
import { EvidenceService, StepBlocker } from './evidence';
import { resolveVideoTool, tryRenderChapters } from './renderEvidenceChapters';

/**
 * Report missing video tooling before anything is launched.
 *
 * Captions are rendered after the run, so a missing ffmpeg is only discovered
 * once the scenario has already finished. Say so up front, with the command to
 * fix it, rather than letting the run complete and produce no annotated video.
 */
function checkVideoTooling(): void {
	const missing = (['ffmpeg', 'ffprobe'] as const).filter(tool => !resolveVideoTool(tool));
	if (!missing.length) {
		return;
	}
	const install = process.platform === 'win32'
		? 'winget install Gyan.FFmpeg'
		: process.platform === 'darwin'
			? 'brew install ffmpeg'
			: 'sudo apt install ffmpeg';
	console.warn(
		`Warning: ${missing.join(' and ')} could not be found, so the recording will not be captioned with step titles.\n` +
		`         The run still produces the raw video, screenshots, trace and report.\n` +
		`         Install ffmpeg (${install}) and re-run. If it is already installed, a PATH change does not\n` +
		`         reach an editor that was already running, so restart it or set FFMPEG_PATH and FFPROBE_PATH,\n` +
		`         then annotate the finished run with: node test/scenario/out/renderEvidenceChapters.js <run-dir>`
	);
}

function wait(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Runs a UI validation scenario end to end and writes an evidence bundle.
 *
 * ```
 * node test/scenario/out/runScenario.js <scenario.cjs> [--build <app-root> | --dev]
 * ```
 *
 * The scenario file is not part of this repository, so it can be written next to
 * the run it produces. Give a CommonJS scenario a `.cjs` extension, because this
 * package is an ES module package; an ES module scenario with a default export
 * works too.
 */

export interface ScenarioContext {
	/** The running VS Code instance. */
	readonly app: Application;
	/** Feature-specific automation (editors, settings editor, terminal, ...). */
	readonly workbench: Workbench;
	readonly code: Code;
	/** The window the driver is currently attached to. */
	readonly page: Page;
	/**
	 * Marks the current step `skipped` and stops the run.
	 *
	 * Say what is missing rather than what failed, and classify it: `human` when
	 * a person is required, `infrastructure` when the harness could do it but
	 * cannot yet. Both are reported prominently; the second is an enhancement
	 * request against this skill.
	 */
	skip(reason: string, options?: { needs?: StepBlocker }): never;
}

export interface ScenarioStep {
	/** Stable identifier, used for screenshot names and the chapter card. */
	readonly id: string;
	readonly title: string;
	/**
	 * Performs the step. Throw to fail it; the thrown message becomes the
	 * recorded detail. Return a string to describe how the step was validated.
	 */
	run(context: ScenarioContext): Promise<string | void> | string | void;
}

export interface Scenario {
	readonly id: string;
	readonly title: string;
	/** Issue or test-plan item this scenario was derived from. */
	readonly source?: string;
	/** Markdown definition this scenario implements. */
	readonly scenarioPath?: string;
	/** Disposable folder to open. Never point a scenario at real work. */
	readonly workspacePath?: string;
	readonly userSettings?: Record<string, JSONValue>;
	readonly extraArgs?: string[];
	/**
	 * How long to hold on each completed step, in milliseconds.
	 *
	 * The recording is watched by a person, and a caption is only readable for as
	 * long as its step is on screen, so each step is held briefly once it
	 * finishes. Set `0` when the scenario depends on timing and must run at full
	 * speed.
	 */
	readonly stepPauseMs?: number;
	readonly steps: readonly ScenarioStep[];
}

const DEFAULT_STEP_PAUSE_MS = 1000;

class SkipStep extends Error {
	constructor(reason: string, readonly needs?: StepBlocker) {
		super(reason);
	}
}

function loadScenario(scenarioPath: string): Scenario {
	// A CommonJS scenario needs a `.cjs` extension because this package is an ES
	// module package; an ES module scenario exporting a default works as well.
	const loaded = require(scenarioPath) as Scenario & { default?: Scenario };
	const scenario = loaded?.default ?? loaded;
	if (!scenario || typeof scenario !== 'object') {
		throw new Error(`Scenario '${scenarioPath}' did not export a scenario object.`);
	}
	for (const field of ['id', 'title'] as const) {
		if (typeof scenario[field] !== 'string' || !scenario[field]) {
			throw new Error(`Scenario '${scenarioPath}' is missing '${field}'.`);
		}
	}
	if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
		throw new Error(`Scenario '${scenarioPath}' must declare at least one step.`);
	}
	const seen = new Set<string>();
	for (const step of scenario.steps) {
		if (typeof step?.id !== 'string' || !step.id || typeof step.title !== 'string' || !step.title) {
			throw new Error(`Scenario '${scenarioPath}' has a step without an 'id' and 'title'.`);
		}
		if (seen.has(step.id)) {
			throw new Error(`Scenario '${scenarioPath}' repeats step id '${step.id}'.`);
		}
		seen.add(step.id);
		if (typeof step.run !== 'function') {
			throw new Error(`Step '${step.id}' does not declare a 'run' function.`);
		}
	}
	return scenario;
}

export interface ScenarioBlocker {
	readonly id: string;
	readonly title: string;
	readonly needs: StepBlocker;
	readonly reason: string;
}

export async function runScenario(scenario: Scenario): Promise<{ runPath: string; outcome: 'passed' | 'failed' | 'aborted'; blockers: ScenarioBlocker[] }> {
	checkVideoTooling();
	const pauseMs = Math.max(0, scenario.stepPauseMs ?? DEFAULT_STEP_PAUSE_MS);
	const blockers: ScenarioBlocker[] = [];
	const appService = new ApplicationService();
	const evidence = new EvidenceService(appService);
	const runPath = await evidence.start(
		scenario.id,
		scenario.title,
		scenario.source,
		scenario.scenarioPath,
		scenario.workspacePath,
		scenario.userSettings,
		scenario.extraArgs
	);
	console.log(`Evidence run: ${runPath}`);

	let outcome: 'passed' | 'failed' | 'aborted' = 'passed';
	let notes: string | undefined;
	try {
		for (const step of scenario.steps) {
			await evidence.step(step.id, step.title, 'started');
			const app = await appService.getApplicationIfRunning();
			if (!app) {
				throw new Error('VS Code is no longer running.');
			}
			const context: ScenarioContext = {
				app,
				workbench: app.workbench,
				code: app.code,
				page: app.code.driver.currentPage,
				skip: (reason: string, options?: { needs?: StepBlocker }) => { throw new SkipStep(reason, options?.needs); }
			};
			try {
				const details = await step.run(context);
				await evidence.step(step.id, step.title, 'passed', details || undefined);
				console.log(`  PASS ${step.id} ${step.title}`);
				// Hold the finished step so its caption is readable in the recording.
				await wait(pauseMs);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const skipped = error instanceof SkipStep;
				const needs = error instanceof SkipStep ? error.needs : undefined;
				await evidence.step(step.id, step.title, skipped ? 'skipped' : 'failed', message, needs);
				console.log(`  ${skipped ? 'SKIP' : 'FAIL'} ${step.id} ${step.title}${needs ? ` [needs ${needs}]` : ''}: ${message}`);
				if (needs) {
					blockers.push({ id: step.id, title: step.title, needs, reason: message });
				}
				// A later step cannot be trusted once the product is in an
				// unexpected state, and a skipped step means its precondition is
				// unavailable, so stop either way rather than reporting noise.
				// A skipped step leaves the scenario unvalidated, so the run is
				// reported as aborted rather than passed.
				outcome = skipped ? 'aborted' : 'failed';
				notes = `${skipped ? 'Skipped' : 'Failed'} at step '${step.id}': ${message}`;
				await wait(pauseMs);
				break;
			}
		}
	} catch (error) {
		outcome = 'failed';
		notes = error instanceof Error ? error.message : String(error);
		console.error(`Scenario aborted: ${notes}`);
	}

	if (blockers.length) {
		notes = [notes, ...blockers.map(blocker => `Step '${blocker.id}' needs ${blocker.needs}: ${blocker.reason}`)].filter(Boolean).join('\n');
	}

	const reportPath = await evidence.finish(outcome, notes);
	console.log(`Report: ${reportPath}`);
	tryRenderChapters(runPath);
	for (const blocker of blockers) {
		const reason = blocker.reason.replace(/\s*\.\s*$/u, '');
		console.log(blocker.needs === 'human'
			? `Needs a person: ${blocker.id} ${blocker.title} - ${reason}.`
			: `Needs harness support: ${blocker.id} ${blocker.title} - ${reason}. This is automatable, so report it as an enhancement to the skill.`);
	}
	return { runPath, outcome, blockers };
}

if (require.main === module) {
	const scenarioArgument = process.argv.slice(2).find(argument => !argument.startsWith('--'));
	if (!scenarioArgument) {
		console.error('Usage: node test/scenario/out/runScenario.js <scenario.cjs> [--build <app-root> | --dev]');
		console.error('  (no target)      run the installed VS Code Insiders, else Stable');
		console.error('  --build <path>   run a specific installed build');
		console.error('  --dev            run the build from this checkout');
		process.exit(2);
	}
	const scenarioPath = path.resolve(scenarioArgument);
	(async () => {
		const { outcome } = await runScenario(loadScenario(scenarioPath));
		console.log(`Outcome: ${outcome}`);
		// Exit rather than resolving, because the harness leaves the profile
		// cleanup timer and Playwright's transport open.
		process.exit(outcome === 'passed' ? 0 : 1);
	})().catch(error => {
		console.error(error instanceof Error ? error.stack ?? error.message : error);
		process.exit(1);
	});
}
