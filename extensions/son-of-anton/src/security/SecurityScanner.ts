/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SandboxManager, SandboxResult } from '../sandbox/SandboxManager';

/**
 * SARIF result as parsed from Semgrep/Trivy output.
 */
export interface SarifResult {
	ruleId: string;
	level: 'error' | 'warning' | 'note' | 'none';
	message: string;
	filePath: string;
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

/**
 * Parsed SARIF output container.
 */
export interface SarifReport {
	tool: string;
	results: SarifResult[];
}

/**
 * Maps SARIF severity levels to VS Code diagnostic severity.
 */
function sarifLevelToDiagnosticSeverity(level: SarifResult['level']): vscode.DiagnosticSeverity {
	switch (level) {
		case 'error': return vscode.DiagnosticSeverity.Error;
		case 'warning': return vscode.DiagnosticSeverity.Warning;
		case 'note': return vscode.DiagnosticSeverity.Information;
		default: return vscode.DiagnosticSeverity.Hint;
	}
}

/**
 * Parses SARIF JSON output into structured results.
 */
export function parseSarif(sarifJson: string, toolName: string): SarifReport {
	try {
		const sarif = JSON.parse(sarifJson);
		const results: SarifResult[] = [];

		for (const run of sarif.runs ?? []) {
			for (const result of run.results ?? []) {
				const location = result.locations?.[0]?.physicalLocation;
				const region = location?.region;
				const artifactUri = location?.artifactLocation?.uri ?? '';
				const filePath = artifactUri.replace(/^file:\/\//, '');

				results.push({
					ruleId: result.ruleId ?? 'unknown',
					level: result.level ?? 'warning',
					message: result.message?.text ?? '',
					filePath,
					startLine: region?.startLine ?? 1,
					startColumn: region?.startColumn ?? 1,
					endLine: region?.endLine ?? region?.startLine ?? 1,
					endColumn: region?.endColumn ?? region?.startColumn ?? 1,
				});
			}
		}

		return { tool: toolName, results };
	} catch {
		return { tool: toolName, results: [] };
	}
}

/**
 * Converts SARIF results into VS Code diagnostics.
 */
export function sarifToDiagnostics(
	report: SarifReport,
	workspaceRoot: string,
): Map<string, vscode.Diagnostic[]> {
	const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

	for (const result of report.results) {
		const relPath = result.filePath.startsWith('/')
			? result.filePath
			: `${workspaceRoot}/${result.filePath}`;

		const range = new vscode.Range(
			Math.max(0, result.startLine - 1),
			Math.max(0, result.startColumn - 1),
			Math.max(0, result.endLine - 1),
			Math.max(0, result.endColumn - 1),
		);

		const diagnostic = new vscode.Diagnostic(
			range,
			`[${report.tool}] ${result.ruleId}: ${result.message}`,
			sarifLevelToDiagnosticSeverity(result.level),
		);
		diagnostic.source = `Son of Anton (${report.tool})`;
		diagnostic.code = result.ruleId;

		const existing = diagnosticMap.get(relPath) ?? [];
		existing.push(diagnostic);
		diagnosticMap.set(relPath, existing);
	}

	return diagnosticMap;
}

/**
 * Security scanner integrating Semgrep SAST and Trivy dependency scanning.
 * Runs inside the sandbox and surfaces results as VS Code diagnostics.
 */
export class SecurityScanner {
	private readonly sandbox: SandboxManager;
	private readonly diagnosticCollection: vscode.DiagnosticCollection;
	private readonly workspaceRoot: string;

	constructor(
		sandbox: SandboxManager,
		workspaceRoot: string,
	) {
		this.sandbox = sandbox;
		this.workspaceRoot = workspaceRoot;
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection('son-of-anton-security');
	}

	/**
	 * Run Semgrep SAST on the specified files.
	 * Returns the parsed SARIF report.
	 */
	async runSemgrep(filePaths: string[]): Promise<SarifReport> {
		const targets = filePaths.map(f => `/workspace/${f}`).join(' ');
		const command = `semgrep --config=auto --sarif --output=/tmp/semgrep.sarif ${targets} 2>/dev/null; cat /tmp/semgrep.sarif`;

		const result = await this.sandbox.execute(command);
		const report = parseSarif(result.stdout, 'Semgrep');

		this.applyDiagnostics(report);
		return report;
	}

	/**
	 * Run Semgrep on staged git changes only.
	 */
	async runSemgrepOnDiff(): Promise<SarifReport> {
		const command = [
			'cd /workspace',
			'git diff --cached --name-only > /tmp/changed_files.txt',
			'semgrep --config=auto --sarif --output=/tmp/semgrep.sarif $(cat /tmp/changed_files.txt) 2>/dev/null',
			'cat /tmp/semgrep.sarif',
		].join(' && ');

		const result = await this.sandbox.execute(command);
		const report = parseSarif(result.stdout, 'Semgrep');

		this.applyDiagnostics(report);
		return report;
	}

	/**
	 * Run Trivy dependency vulnerability scan.
	 */
	async runTrivy(): Promise<SarifReport> {
		const command = 'trivy fs --scanners vuln --format sarif --output /tmp/trivy.sarif /workspace 2>/dev/null && cat /tmp/trivy.sarif';

		const result = await this.sandbox.execute(command);
		const report = parseSarif(result.stdout, 'Trivy');

		this.applyDiagnostics(report);
		return report;
	}

	/**
	 * Run both Semgrep and Trivy, returning combined results.
	 */
	async runFullScan(filePaths: string[]): Promise<{ semgrep: SarifReport; trivy: SarifReport }> {
		const [semgrep, trivy] = await Promise.all([
			this.runSemgrep(filePaths),
			this.runTrivy(),
		]);
		return { semgrep, trivy };
	}

	/**
	 * Apply a SARIF report as VS Code diagnostics.
	 */
	private applyDiagnostics(report: SarifReport): void {
		const diagnosticMap = sarifToDiagnostics(report, this.workspaceRoot);

		for (const [filePath, diagnostics] of diagnosticMap) {
			const uri = vscode.Uri.file(filePath);
			this.diagnosticCollection.set(uri, diagnostics);
		}
	}

	/**
	 * Check whether any report contains blocking (error-level) findings.
	 */
	hasBlockingFindings(report: SarifReport): boolean {
		return report.results.some(r => r.level === 'error');
	}

	/**
	 * Clear all diagnostics from the security scanner.
	 */
	clearDiagnostics(): void {
		this.diagnosticCollection.clear();
	}

	/**
	 * Dispose the diagnostic collection.
	 */
	dispose(): void {
		this.diagnosticCollection.dispose();
	}
}
