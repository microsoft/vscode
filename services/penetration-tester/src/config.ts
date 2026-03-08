/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PenTestConfig } from './types';

/**
 * Load configuration from environment variables with sensible defaults.
 */
export function loadConfig(): PenTestConfig {
	return {
		port: parseInt(process.env.PEN_TEST_PORT ?? '8092', 10),
		zapHost: process.env.ZAP_HOST ?? 'owasp-zap',
		zapPort: parseInt(process.env.ZAP_PORT ?? '8090', 10),
		targetBaseUrl: process.env.TARGET_BASE_URL ?? 'http://localhost:3000',
		falkordbHost: process.env.FALKORDB_HOST ?? 'falkordb',
		falkordbPort: parseInt(process.env.FALKORDB_PORT ?? '6379', 10),
		maxRequestsPerTest: parseInt(process.env.MAX_REQUESTS_PER_TEST ?? '100', 10),
		testTimeoutMs: parseInt(process.env.TEST_TIMEOUT_MS ?? '60000', 10),
	};
}

/**
 * Validate that a target URL is localhost only.
 * Pen testing must never target external hosts.
 */
export function validateTargetUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
		return allowedHosts.includes(parsed.hostname);
	} catch {
		return false;
	}
}
