/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { RSession } from './session';
import { generateDirectInjectionId } from './util.js';

export async function handleRCode(runtime: RSession, code: string): Promise<void> {
	const match = matchRunnable(code);

	if (!match) {
		return handleNotRunnable(code);
	}
	if (!match.groups) {
		return handleNotRunnable(code);
	}

	const packageName = match.groups.package;

	if (isCorePackage(packageName)) {
		return handleNotRunnable(code);
	}

	if (isBlessedPackage(packageName)) {
		return handleAutomaticallyRunnable(runtime, code);
	}
	if (await runtime.isPackageAttached(packageName)) {
		return handleAutomaticallyRunnable(runtime, code);
	}

	return await handleManuallyRunnable(runtime, code);
}

function handleNotRunnable(code: string) {
	vscode.window.showInformationMessage(vscode.l10n.t(
		`Code hyperlink not recognized. Manually run the following if you trust the hyperlink source: \`${code}\`.`
	));
}

async function handleManuallyRunnable(_runtime: RSession, code: string) {
	const console = await erdos.window.getConsoleForLanguage('r');

	if (!console) {
		vscode.window.showInformationMessage(vscode.l10n.t(
			`Failed to locate an R console. Code hyperlink written to clipboard instead: \`${code}\`.`
		));
		vscode.env.clipboard.writeText(code);
		return;
	}

	console.pasteText(code);
}

function handleAutomaticallyRunnable(runtime: RSession, code: string) {
	runtime.execute(
		code,
		generateDirectInjectionId(),
		erdos.RuntimeCodeExecutionMode.Transient,
		erdos.RuntimeErrorBehavior.Continue
	);
}

export function matchRunnable(code: string): RegExpMatchArray | null {
	const runnableRegExp = /^(?<package>\w+)::(?<function>\w+)[(][^();]*[)]$/;
	return code.match(runnableRegExp);
}

function isCorePackage(packageName: string): boolean {
	const corePackages = ['utils', 'base', 'stats'];
	return corePackages.includes(packageName);
}

function isBlessedPackage(packageName: string): boolean {
	const blessedPackages = ['testthat', 'rlang', 'devtools', 'usethis', 'pkgload', 'pkgdown'];
	return blessedPackages.includes(packageName);
}
