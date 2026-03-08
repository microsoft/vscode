/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { PenTestConfig } from '../types';

/**
 * Client for communicating with the OWASP ZAP daemon API.
 * All scan operations are routed through this client.
 */
export class ZapClient {
	private readonly baseUrl: string;

	constructor(config: PenTestConfig) {
		this.baseUrl = `http://${config.zapHost}:${config.zapPort}`;
	}

	/**
	 * Check if ZAP is available and responsive.
	 */
	async isHealthy(): Promise<boolean> {
		try {
			const response = await this.apiGet('/JSON/core/view/version/');
			return response !== null && typeof response.version === 'string';
		} catch {
			return false;
		}
	}

	/**
	 * Start a baseline (passive) scan against the target URL.
	 * This only analyses responses — no attack payloads are sent.
	 */
	async startBaselineScan(targetUrl: string): Promise<string> {
		const result = await this.apiGet('/JSON/spider/action/scan/', {
			url: targetUrl,
			maxChildren: '10',
			recurse: 'true',
		});
		return result?.scan ?? '';
	}

	/**
	 * Start an active scan against the target URL.
	 * This sends attack payloads — only run with developer approval.
	 */
	async startActiveScan(targetUrl: string): Promise<string> {
		const result = await this.apiGet('/JSON/ascan/action/scan/', {
			url: targetUrl,
			recurse: 'true',
			inScopeOnly: 'true',
		});
		return result?.scan ?? '';
	}

	/**
	 * Get the status of an active scan.
	 * Returns a percentage (0-100).
	 */
	async getActiveScanStatus(scanId: string): Promise<number> {
		const result = await this.apiGet('/JSON/ascan/view/status/', {
			scanId,
		});
		return parseInt(result?.status ?? '0', 10);
	}

	/**
	 * Get the status of a spider scan.
	 * Returns a percentage (0-100).
	 */
	async getSpiderStatus(scanId: string): Promise<number> {
		const result = await this.apiGet('/JSON/spider/view/status/', {
			scanId,
		});
		return parseInt(result?.status ?? '0', 10);
	}

	/**
	 * Retrieve all alerts (findings) from ZAP.
	 */
	async getAlerts(targetUrl: string): Promise<ZapAlert[]> {
		const result = await this.apiGet('/JSON/alert/view/alerts/', {
			baseurl: targetUrl,
			start: '0',
			count: '500',
		});

		if (!result?.alerts || !Array.isArray(result.alerts)) {
			return [];
		}

		return result.alerts.map((alert: Record<string, string>) => ({
			pluginId: alert.pluginId ?? '',
			alertRef: alert.alertRef ?? '',
			name: alert.name ?? '',
			riskCode: parseInt(alert.riskcode ?? '0', 10),
			confidence: parseInt(alert.confidence ?? '0', 10),
			riskDesc: alert.riskdesc ?? '',
			description: alert.description ?? '',
			solution: alert.solution ?? '',
			url: alert.url ?? '',
			method: alert.method ?? '',
			param: alert.param ?? '',
			attack: alert.attack ?? '',
			evidence: alert.evidence ?? '',
			cweid: alert.cweid ?? '',
			wascid: alert.wascid ?? '',
		}));
	}

	/**
	 * Clear all alerts and session data from ZAP.
	 */
	async clearSession(): Promise<void> {
		await this.apiGet('/JSON/core/action/newSession/', {
			overwrite: 'true',
		});
	}

	/**
	 * Set the scan policy to limit active scan scope.
	 */
	async setScanScope(targetUrl: string): Promise<void> {
		await this.apiGet('/JSON/context/action/includeInContext/', {
			contextName: 'pen-test',
			regex: `${targetUrl}.*`,
		});
	}

	/**
	 * Make a GET request to the ZAP API.
	 */
	private async apiGet(
		path: string,
		params: Record<string, string> = {},
	): Promise<Record<string, unknown> | null> {
		const queryString = new URLSearchParams(params).toString();
		const url = queryString ? `${this.baseUrl}${path}?${queryString}` : `${this.baseUrl}${path}`;

		return new Promise((resolve, reject) => {
			const request = http.get(url, { timeout: 30000 }, response => {
				let data = '';
				response.on('data', chunk => { data += chunk; });
				response.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						resolve(null);
					}
				});
			});
			request.on('error', reject);
			request.on('timeout', () => {
				request.destroy();
				reject(new Error('ZAP API request timed out'));
			});
		});
	}
}

/**
 * A ZAP alert (finding) from the scan.
 */
export interface ZapAlert {
	pluginId: string;
	alertRef: string;
	name: string;
	riskCode: number;
	confidence: number;
	riskDesc: string;
	description: string;
	solution: string;
	url: string;
	method: string;
	param: string;
	attack: string;
	evidence: string;
	cweid: string;
	wascid: string;
}
