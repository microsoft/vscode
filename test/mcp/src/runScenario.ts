/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Page } from '@playwright/test';
import * as path from 'path';
import type { Application, Code, Workbench } from '../../automation';
import { ApplicationService, JSONValue } from './application';
import { EvidenceService } from './evidence';
import { renderChapters } from './renderEvidenceChapters';

/**
 * Runs a UI validation scenario end to end and writes an evidence bundle.
 *
 * This is the same capture pipeline the `vscode_automation_evidence_*` MCP tools
 * drive, exposed as a single command so a scenario can be recorded without
 * configuring an MCP server:
 *
 * ```
 * node test/mcp/out/runScenario.js <scenario.cjs> [--build <app-root>]
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
	/** Marks the current step `skipped` and stops the run. */
	skip(reason: string): never;
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
	readonly steps: readonly ScenarioStep[];
}

class SkipStep extends Error { }

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

export async function runScenario(scenario: Scenario): Promise<{ runPath: string; outcome: 'passed' | 'failed' | 'aborted' }> {
	// The step banner is drawn into the DOM of the product under test, so it can
	// shift layout and influence focus. Chapters are rendered onto the finished
	// recording instead, which keeps the capture faithful.
	process.env.VSCODE_EVIDENCE_CLEAN_CAPTURE ??= '1';

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
				skip: (reason: string) => { throw new SkipStep(reason); }
			};
			try {
				const details = await step.run(context);
				await evidence.step(step.id, step.title, 'passed', details || undefined);
				console.log(`  PASS ${step.id} ${step.title}`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const skipped = error instanceof SkipStep;
				await evidence.step(step.id, step.title, skipped ? 'skipped' : 'failed', message);
				console.log(`  ${skipped ? 'SKIP' : 'FAIL'} ${step.id} ${step.title}: ${message}`);
				// A later step cannot be trusted once the product is in an
				// unexpected state, and a skipped step means its precondition is
				// unavailable, so stop either way rather than reporting noise.
				// A skipped step leaves the scenario unvalidated, so the run is
				// reported as aborted rather than passed.
				outcome = skipped ? 'aborted' : 'failed';
				notes = `${skipped ? 'Skipped' : 'Failed'} at step '${step.id}': ${message}`;
				break;
			}
		}
	} catch (error) {
		outcome = 'failed';
		notes = error instanceof Error ? error.message : String(error);
		console.error(`Scenario aborted: ${notes}`);
	}

	const reportPath = await evidence.finish(outcome, notes);
	console.log(`Report: ${reportPath}`);
	renderChapters(runPath);
	return { runPath, outcome };
}

if (require.main === module) {
	const scenarioArgument = process.argv.slice(2).find(argument => !argument.startsWith('--'));
	if (!scenarioArgument) {
		console.error('Usage: node test/mcp/out/runScenario.js <scenario.cjs> [--build <app-root>]');
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
