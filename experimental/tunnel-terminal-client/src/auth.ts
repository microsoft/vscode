/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile as nodeExecFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export interface AuthOptions {
	provider: 'github' | 'microsoft';
	clientId?: string;
	signal?: AbortSignal;
	log(message: string): void;
}

interface AuthDependencies {
	env: Readonly<Record<string, string | undefined>>;
	fetch: typeof globalThis.fetch;
	execFile(command: string, args: readonly string[], options: { signal?: AbortSignal; timeout: number }): Promise<string>;
	sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
	now(): number;
	requestTimeoutMs: number;
}

const verificationUrl = 'https://github.com/login/device';
const requestTimeoutMs = 30_000;
const maxTimerMs = 2_147_483_647;
const ghHelp = 'Install GitHub CLI and run "gh auth login --hostname github.com", or supply your own GitHub OAuth client ID with device flow enabled. No other credential source was tried.';

const defaultDependencies: AuthDependencies = {
	env: process.env,
	fetch: (input, init) => globalThis.fetch(input, init),
	execFile: (command, args, options) => new Promise((resolve, reject) => {
		nodeExecFile(command, args, { ...options, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 16_384 }, (error, stdout) => {
			if (error) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	}),
	sleep: async (milliseconds, signal) => {
		await delay(milliseconds, undefined, { signal });
	},
	now: () => performance.now(),
	requestTimeoutMs
};

function checkAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		const error = new Error('Authentication was cancelled.');
		error.name = 'AbortError';
		throw error;
	}
}

function expired(): Error {
	return new Error('GitHub device authorization expired. Run the command again to request a new code.');
}

function malformed(): Error {
	return new Error('GitHub returned an invalid authentication response. Retry with your own OAuth app with device flow enabled.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && !/[\s\x00-\x1f\x7f]/.test(value);
}

function isSeconds(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= Math.floor(maxTimerMs / 1000);
}

function oauthError(code: string): Error {
	switch (code) {
		case 'access_denied':
			return new Error('GitHub device authorization was denied. Run the command again if you want to sign in.');
		case 'expired_token':
		case 'token_expired':
			return expired();
		case 'device_flow_disabled':
			return new Error('Enable device flow in your own GitHub OAuth app settings and try again.');
		case 'incorrect_client_credentials':
			return new Error('GitHub rejected the OAuth client ID. Supply the client ID of your own GitHub OAuth app with device flow enabled.');
		case 'incorrect_device_code':
			return new Error('GitHub rejected the device authorization. Run the command again to request a new code.');
		default:
			return new Error('GitHub device authorization failed. Check your own OAuth app configuration and try again.');
	}
}

async function post(
	url: string,
	body: URLSearchParams,
	options: AuthOptions,
	dependencies: AuthDependencies,
	deadline?: number
): Promise<Record<string, unknown>> {
	checkAborted(options.signal);
	const remaining = deadline === undefined ? dependencies.requestTimeoutMs : deadline - dependencies.now();
	if (remaining <= 0) {
		throw expired();
	}
	const timeout = new AbortController();
	const expiresOnTimeout = deadline !== undefined && remaining <= dependencies.requestTimeoutMs;
	const timer = setTimeout(() => timeout.abort(), Math.ceil(Math.min(remaining, dependencies.requestTimeoutMs)));
	const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
	const checkInterrupted = () => {
		checkAborted(options.signal);
		if ((deadline !== undefined && dependencies.now() >= deadline) || (timeout.signal.aborted && expiresOnTimeout)) {
			throw expired();
		}
		if (timeout.signal.aborted) {
			throw new Error('GitHub authentication request timed out. Check your connection and try again.');
		}
	};

	try {
		let response: Response;
		try {
			response = await dependencies.fetch(url, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
				body,
				signal,
				redirect: 'error'
			});
		} catch {
			checkInterrupted();
			throw new Error('Could not contact GitHub for authentication. Check your connection and try again.');
		}
		checkInterrupted();
		if (!response.ok) {
			throw new Error(`GitHub authentication request failed (HTTP ${response.status}). Check your OAuth app configuration and try again.`);
		}
		let result: unknown;
		try {
			result = await response.json();
		} catch {
			checkInterrupted();
			throw malformed();
		}
		checkInterrupted();
		if (!isRecord(result)) {
			throw malformed();
		}
		return result;
	} finally {
		clearTimeout(timer);
	}
}

async function getDeviceToken(clientId: string, options: AuthOptions, dependencies: AuthDependencies): Promise<string> {
	// Count request time conservatively so a delayed response cannot extend the code's lifetime.
	const started = dependencies.now();
	const device = await post('https://github.com/login/device/code', new URLSearchParams({
		client_id: clientId,
		scope: 'read:user'
	}), options, dependencies);
	if (typeof device.error === 'string') {
		throw oauthError(device.error);
	}
	const initialInterval = device.interval === undefined ? 5 : device.interval;
	if (
		'error' in device ||
		!isToken(device.device_code) ||
		typeof device.user_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(device.user_code) ||
		device.verification_uri !== verificationUrl ||
		!isSeconds(device.expires_in) ||
		!isSeconds(initialInterval)
	) {
		throw malformed();
	}
	const deadline = started + device.expires_in * 1000;
	let interval = initialInterval * 1000;
	options.log(`Open ${verificationUrl} in your browser and enter code ${device.user_code}.`);
	options.log('Waiting for GitHub authorization. Approve only the OAuth app you configured; press Ctrl+C to cancel.');

	for (;;) {
		checkAborted(options.signal);
		const remaining = deadline - dependencies.now();
		if (remaining <= 0) {
			throw expired();
		}
		try {
			await dependencies.sleep(Math.min(interval, remaining), options.signal);
		} catch {
			checkAborted(options.signal);
			throw new Error('Could not wait for GitHub authorization. Run the command again.');
		}
		checkAborted(options.signal);
		if (dependencies.now() >= deadline) {
			throw expired();
		}
		const result = await post('https://github.com/login/oauth/access_token', new URLSearchParams({
			client_id: clientId,
			device_code: device.device_code,
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
		}), options, dependencies, deadline);
		if ('access_token' in result) {
			if ('error' in result || !isToken(result.access_token) || typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer') {
				throw malformed();
			}
			return result.access_token;
		}
		switch (result.error) {
			case 'authorization_pending':
				break;
			case 'slow_down': {
				const newInterval = result.interval;
				if (newInterval !== undefined && !isSeconds(newInterval)) {
					throw malformed();
				}
				interval = Math.max(interval + 5000, newInterval === undefined ? 0 : newInterval * 1000);
				break;
			}
			default:
				if (typeof result.error !== 'string') {
					throw malformed();
				}
				throw oauthError(result.error);
		}
	}
}

/**
 * Acquires an in-memory provider token without accessing VS Code credentials.
 * GitHub CLI owns any external persisted login; device-flow tokens are never saved.
 */
export async function getAccessToken(options: AuthOptions, overrides: Partial<AuthDependencies> = {}): Promise<string> {
	const dependencies = { ...defaultDependencies, ...overrides };
	checkAborted(options.signal);
	if (options.provider !== 'github' && options.provider !== 'microsoft') {
		throw new Error('Choose the github or microsoft authentication provider.');
	}
	const supplied = dependencies.env.TUNNEL_ACCESS_TOKEN;
	if (supplied !== undefined) {
		const token = supplied.trim();
		if (!isToken(token)) {
			throw new Error('TUNNEL_ACCESS_TOKEN must contain a non-empty token without embedded whitespace or control characters.');
		}
		options.log(`Using the supplied TUNNEL_ACCESS_TOKEN for ${options.provider}; the client keeps it only in memory.`);
		return token;
	}
	if (options.provider === 'microsoft') {
		throw new Error('Microsoft sign-in is not implemented in this prototype. Set TUNNEL_ACCESS_TOKEN to a Microsoft token valid for the Dev Tunnels service, or choose GitHub. A Microsoft client ID alone is not supported.');
	}
	if (!Number.isSafeInteger(dependencies.requestTimeoutMs) || dependencies.requestTimeoutMs <= 0 || dependencies.requestTimeoutMs > maxTimerMs) {
		throw new Error('Authentication request timeout must be a positive supported number of milliseconds.');
	}
	if (options.clientId !== undefined) {
		const clientId = options.clientId.trim();
		if (!isToken(clientId)) {
			throw new Error('Supply a non-empty client ID for your own GitHub OAuth app with device flow enabled.');
		}
		return getDeviceToken(clientId, options, dependencies);
	}
	options.log('Reading the GitHub CLI login for github.com; GitHub CLI manages this login externally.');
	let output: string;
	try {
		output = await dependencies.execFile('gh', ['auth', 'token', '--hostname', 'github.com'], {
			signal: options.signal,
			timeout: dependencies.requestTimeoutMs
		});
	} catch {
		checkAborted(options.signal);
		throw new Error(`Could not read a GitHub CLI token. ${ghHelp}`);
	}
	checkAborted(options.signal);
	const token = output.trim();
	if (!isToken(token)) {
		throw new Error(`GitHub CLI did not return a valid token. ${ghHelp}`);
	}
	return token;
}
