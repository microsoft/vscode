/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Security finding from code or pattern scanning.
 */
export interface SecurityFinding {
	rule: string;
	severity: 'info' | 'warning' | 'error';
	message: string;
	line: number;
	column: number;
}

/**
 * An entry in the extension allowlist.
 */
export interface ExtensionAllowlistEntry {
	id: string;
	publisher: string;
	reason: string;
}

/**
 * An entry in the MCP server trust list.
 */
export interface McpServerTrustEntry {
	name: string;
	url: string;
	trusted: boolean;
	reason: string;
}

/**
 * Configuration for supply chain controls.
 */
export interface SupplyChainConfig {
	extensionAllowlist: ExtensionAllowlistEntry[];
	mcpServerTrustList: McpServerTrustEntry[];
}

/**
 * Forbidden code patterns that should never appear in agent-generated code.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; rule: string; message: string }[] = [
	{ pattern: /\beval\s*\(/, rule: 'no-eval', message: 'Use of eval() is forbidden — potential code injection.' },
	{ pattern: /\bnew\s+Function\s*\(/, rule: 'no-function-constructor', message: 'Use of Function constructor is forbidden — potential code injection.' },
	{ pattern: /document\.write\s*\(/, rule: 'no-document-write', message: 'document.write() is forbidden — XSS risk.' },
	{ pattern: /innerHTML\s*=/, rule: 'no-inner-html', message: 'Direct innerHTML assignment is forbidden — XSS risk. Use textContent or DOM APIs.' },
	{ pattern: /\.exec\s*\(\s*['"`]/, rule: 'no-shell-exec-literal', message: 'Shell exec with string literal — potential command injection.' },
	{ pattern: /child_process/, rule: 'no-child-process', message: 'Direct child_process usage — use the sandbox instead.' },
	{ pattern: /\bexecSync\b/, rule: 'no-exec-sync', message: 'execSync is forbidden — use sandbox execution.' },
	{ pattern: /process\.env\b/, rule: 'no-process-env-write', message: 'Direct process.env access — use configuration service instead.' },
	{ pattern: /SELECT\s+.*FROM\s+.*WHERE\s+.*\+\s*['"`]/, rule: 'sql-concat', message: 'SQL string concatenation — use parameterised queries.' },
	{ pattern: /\.query\s*\(\s*['"`].*\$\{/, rule: 'sql-template-literal', message: 'SQL template literal interpolation — use parameterised queries.' },
];

/**
 * Supply chain security controls.
 * Validates extensions, MCP servers, and agent-generated code.
 */
export class SupplyChainGuard {
	private extensionAllowlist: Map<string, ExtensionAllowlistEntry> = new Map();
	private mcpServerTrustList: Map<string, McpServerTrustEntry> = new Map();
	private readonly mcpConnectionLog: { server: string; timestamp: number; trusted: boolean }[] = [];
	private extensionChangeListener: vscode.Disposable | undefined;

	/**
	 * Load configuration from a SupplyChainConfig object.
	 */
	loadConfig(config: SupplyChainConfig): void {
		this.extensionAllowlist.clear();
		for (const entry of config.extensionAllowlist) {
			this.extensionAllowlist.set(entry.id, entry);
		}

		this.mcpServerTrustList.clear();
		for (const entry of config.mcpServerTrustList) {
			this.mcpServerTrustList.set(entry.name, entry);
		}
	}

	/**
	 * Start watching for extension changes and validate against the allowlist.
	 */
	startExtensionWatcher(): vscode.Disposable {
		this.extensionChangeListener = vscode.extensions.onDidChange(() => {
			this.validateInstalledExtensions();
		});
		return this.extensionChangeListener;
	}

	/**
	 * Validate all currently installed extensions against the allowlist.
	 * Returns IDs of extensions not in the allowlist.
	 */
	validateInstalledExtensions(): string[] {
		const violations: string[] = [];

		for (const ext of vscode.extensions.all) {
			// Skip built-in extensions
			if (ext.packageJSON?.isBuiltin) {
				continue;
			}

			const entry = this.extensionAllowlist.get(ext.id);
			if (!entry) {
				violations.push(ext.id);
				vscode.window.showWarningMessage(
					`Extension "${ext.id}" is not in the Son of Anton allowlist.`
				);
				continue;
			}

			// Verify publisher matches
			const publisher = ext.id.split('.')[0];
			if (publisher && entry.publisher !== publisher) {
				violations.push(ext.id);
				vscode.window.showWarningMessage(
					`Extension "${ext.id}" publisher mismatch: expected "${entry.publisher}", got "${publisher}".`
				);
			}
		}

		return violations;
	}

	/**
	 * Check whether an extension install is allowed.
	 */
	isExtensionAllowed(extensionId: string): boolean {
		return this.extensionAllowlist.has(extensionId);
	}

	/**
	 * Validate an MCP server connection.
	 * Logs the connection and warns if the server is not trusted.
	 */
	validateMcpConnection(serverName: string): boolean {
		const entry = this.mcpServerTrustList.get(serverName);
		const trusted = entry?.trusted ?? false;

		this.mcpConnectionLog.push({
			server: serverName,
			timestamp: Date.now(),
			trusted,
		});

		if (!trusted) {
			vscode.window.showWarningMessage(
				`MCP server "${serverName}" is not in the trusted server list.`
			);
		}

		return trusted;
	}

	/**
	 * Get the MCP connection log for auditing.
	 */
	getMcpConnectionLog(): ReadonlyArray<{ server: string; timestamp: number; trusted: boolean }> {
		return this.mcpConnectionLog;
	}

	/**
	 * Scan code for security vulnerabilities using forbidden patterns.
	 */
	async scanCode(code: string, _language: string): Promise<SecurityFinding[]> {
		const findings: SecurityFinding[] = [];
		const lines = code.split('\n');

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex];
			for (const { pattern, rule, message } of FORBIDDEN_PATTERNS) {
				const match = pattern.exec(line);
				if (match) {
					findings.push({
						rule,
						severity: 'error',
						message,
						line: lineIndex + 1,
						column: (match.index ?? 0) + 1,
					});
				}
			}
		}

		return findings;
	}

	/**
	 * Check if code introduces any forbidden patterns.
	 */
	async checkForbiddenPatterns(code: string): Promise<SecurityFinding[]> {
		return this.scanCode(code, '');
	}

	/**
	 * Dispose resources.
	 */
	dispose(): void {
		this.extensionChangeListener?.dispose();
	}
}
