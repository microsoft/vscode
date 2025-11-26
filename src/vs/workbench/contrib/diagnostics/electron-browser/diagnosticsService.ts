/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import type { DiagnosticResult, DiagnosticCheckId } from '../common/diagnosticsTypes.js';
import { getPathLengthLimit, DIAGNOSTIC_CHECK_IDS } from '../common/diagnosticsConstants.js';
import { IDiagnosticsService } from '../common/diagnosticsService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import * as path from '../../../../base/common/path.js';

export class DiagnosticsService extends Disposable implements IDiagnosticsService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeResults = this._register(new Emitter<DiagnosticResult[]>());
	readonly onDidChangeResults = this._onDidChangeResults.event;

	private results: DiagnosticResult[] = [];

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService
	) {
		super();
	}

	async runDiagnostics(): Promise<DiagnosticResult[]> {
		const results: DiagnosticResult[] = [];

		for (const checkId of DIAGNOSTIC_CHECK_IDS) {
			try {
				const result = await this.runCheck(checkId);
				results.push(result);
			} catch (error) {
				this.logService.error(`Failed to run diagnostic check ${checkId}:`, error);
				results.push({
					id: checkId,
					name: this.getCheckName(checkId),
					status: 'unknown',
					message: localize('diagnostics.check.failed', 'Check failed'),
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		this.results = results;
		this._onDidChangeResults.fire(results);
		return results;
	}

	async runCheck(checkId: DiagnosticCheckId): Promise<DiagnosticResult> {
		switch (checkId) {
			case 'pathLength':
				return this.checkPathLength();
			case 'symlinkSupport':
				return this.checkSymlinkSupport();
			case 'wslDetection':
				return this.checkWslDetection();
			default:
				throw new Error(`Unknown check ID: ${checkId}`);
		}
	}

	getResults(): DiagnosticResult[] {
		return [...this.results];
	}

	private async checkPathLength(): Promise<DiagnosticResult> {
		const pathEnv = process.env.PATH || '';
		const pathLength = pathEnv.length;
		const limit = getPathLengthLimit();
		const platformName = isWindows ? 'Windows' : 'Unix';

		if (pathLength > limit) {
			return {
				id: 'pathLength',
				name: localize('diagnostics.pathLength.name', 'PATH Length'),
				status: 'fail',
				message: localize('diagnostics.pathLength.fail', 'PATH length: {0} chars (limit: {1} on {2})', pathLength, limit, platformName),
				remediation: localize('diagnostics.pathLength.remediation', 'Reduce PATH length by removing unnecessary entries or using shorter paths.'),
				documentationLink: '#path-length-requirements'
			};
		}

		return {
			id: 'pathLength',
			name: localize('diagnostics.pathLength.name', 'PATH Length'),
			status: 'pass',
			message: localize('diagnostics.pathLength.pass', 'PATH length: {0} chars (limit: {1} on {2})', pathLength, limit, platformName),
			documentationLink: '#path-length-requirements'
		};
	}

	private async checkSymlinkSupport(): Promise<DiagnosticResult> {
		try {
			// Use dynamic require to access fs module at runtime (electron-browser has Node.js access)
			const fs = require('fs') as typeof import('fs');
			const tempDir = this.environmentService.tmpDir.fsPath;
			const tempFile = path.join(tempDir, `vscode-diagnostics-test-${Date.now()}.tmp`);
			const symlinkPath = path.join(tempDir, `vscode-diagnostics-symlink-${Date.now()}.tmp`);

			fs.writeFileSync(tempFile, 'test');

			try {
				fs.symlinkSync(tempFile, symlinkPath);
				fs.unlinkSync(symlinkPath);
				fs.unlinkSync(tempFile);

				return {
					id: 'symlinkSupport',
					name: localize('diagnostics.symlinkSupport.name', 'Symlink Support'),
					status: 'pass',
					message: localize('diagnostics.symlinkSupport.pass', 'Symlink support enabled'),
					documentationLink: '#symlink-support-requirements'
				};
			} catch (error) {
				try {
					if (fs.existsSync(tempFile)) {
						fs.unlinkSync(tempFile);
					}
				} catch {
					// Ignore cleanup errors
				}

				return {
					id: 'symlinkSupport',
					name: localize('diagnostics.symlinkSupport.name', 'Symlink Support'),
					status: 'fail',
					message: localize('diagnostics.symlinkSupport.fail', 'Symlink support disabled'),
					error: error instanceof Error ? error.message : String(error),
					remediation: localize('diagnostics.symlinkSupport.remediation', 'Enable symlink support. On Windows, enable Developer Mode or run as administrator.'),
					documentationLink: '#symlink-support-requirements'
				};
			}
		} catch (error) {
			return {
				id: 'symlinkSupport',
				name: localize('diagnostics.symlinkSupport.name', 'Symlink Support'),
				status: 'unknown',
				message: localize('diagnostics.symlinkSupport.unknown', 'Unable to check symlink support'),
				error: error instanceof Error ? error.message : String(error),
				documentationLink: '#symlink-support-requirements'
			};
		}
	}

	private async checkWslDetection(): Promise<DiagnosticResult> {
		if (!isWindows) {
			return {
				id: 'wslDetection',
				name: localize('diagnostics.wslDetection.name', 'WSL Detection'),
				status: 'info',
				message: localize('diagnostics.wslDetection.skip', 'WSL detection (Windows only)'),
				documentationLink: '#wsl-detection'
			};
		}

		let isWSL = process.env.WSL_DISTRO_NAME !== undefined ||
			process.env.WSLENV !== undefined ||
			(process.env.PATH?.includes('Windows\\System32\\wsl.exe') ?? false);

		if (!isWSL) {
			// Use dynamic require to access fs module at runtime
			const fs = require('fs') as typeof import('fs');
			try {
				if (fs.existsSync('/proc/version')) {
					const procVersion = fs.readFileSync('/proc/version', 'utf8');
					isWSL = procVersion.toLowerCase().includes('microsoft');
				}
			} catch {
				// Ignore errors
			}
		}

		if (isWSL) {
			return {
				id: 'wslDetection',
				name: localize('diagnostics.wslDetection.name', 'WSL Detection'),
				status: 'info',
				message: localize('diagnostics.wslDetection.detected', 'Running in WSL'),
				documentationLink: '#wsl-detection'
			};
		}

		return {
			id: 'wslDetection',
			name: localize('diagnostics.wslDetection.name', 'WSL Detection'),
			status: 'info',
			message: localize('diagnostics.wslDetection.notDetected', 'Not running in WSL'),
			documentationLink: '#wsl-detection'
		};
	}

	private getCheckName(checkId: DiagnosticCheckId): string {
		switch (checkId) {
			case 'pathLength':
				return localize('diagnostics.pathLength.name', 'PATH Length');
			case 'symlinkSupport':
				return localize('diagnostics.symlinkSupport.name', 'Symlink Support');
			case 'wslDetection':
				return localize('diagnostics.wslDetection.name', 'WSL Detection');
		}
	}
}

