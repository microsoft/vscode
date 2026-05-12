/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'node:http';
import { PenTestConfig } from '../types';

/**
 * Coerce an unknown value to a string, falling back to an empty string for
 * anything that isn't already a string or number. Used to defang the
 * dynamic shape of ZAP's JSON responses before we feed it into typed APIs.
 */
function asString(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}

/**
 * Coerce an unknown value to a base-10 integer. Returns `fallback` if the
 * value isn't a finite number after parsing.
 */
function asInt(value: unknown, fallback = 0): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

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
		return asString(result?.scan);
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
		return asString(result?.scan);
	}

	/**
	 * Get the status of an active scan.
	 * Returns a percentage (0-100).
	 */
	async getActiveScanStatus(scanId: string): Promise<number> {
		const result = await this.apiGet('/JSON/ascan/view/status/', {
			scanId,
		});
		return asInt(result?.status, 0);
	}

	/**
	 * Get the status of a spider scan.
	 * Returns a percentage (0-100).
	 */
	async getSpiderStatus(scanId: string): Promise<number> {
		const result = await this.apiGet('/JSON/spider/view/status/', {
			scanId,
		});
		return asInt(result?.status, 0);
	}

	/**
	 * Retrieve all alerts (findings) from ZAP.
	 *
	 * ZAP's JSON shape is documented but loosely typed at runtime — we coerce
	 * every field via `asString` / `asInt` so a malformed payload can't crash
	 * downstream consumers. Items that aren't object-shaped are skipped.
	 */
	async getAlerts(targetUrl: string): Promise<ZapAlert[]> {
		const result = await this.apiGet('/JSON/alert/view/alerts/', {
			baseurl: targetUrl,
			start: '0',
			count: '500',
		});

		const rawAlerts = result?.alerts;
		if (!Array.isArray(rawAlerts)) {
			return [];
		}

		const alerts: ZapAlert[] = [];
		for (const raw of rawAlerts) {
			if (raw === null || typeof raw !== 'object') {
				continue;
			}
			const alert = raw as Record<string, unknown>;
			alerts.push({
				pluginId: asString(alert.pluginId),
				alertRef: asString(alert.alertRef),
				name: asString(alert.name),
				riskCode: asInt(alert.riskcode, 0),
				confidence: asInt(alert.confidence, 0),
				riskDesc: asString(alert.riskdesc),
				description: asString(alert.description),
				solution: asString(alert.solution),
				url: asString(alert.url),
				method: asString(alert.method),
				param: asString(alert.param),
				attack: asString(alert.attack),
				evidence: asString(alert.evidence),
				cweid: asString(alert.cweid),
				wascid: asString(alert.wascid),
			});
		}
		return alerts;
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
