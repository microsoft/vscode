/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const nativeExitProbeRequiredInputs = [
	'BUILDS_API_URL', 'SYSTEM_ACCESSTOKEN', 'SYSTEM_COLLECTIONURI', 'SYSTEM_TEAMPROJECT',
	'BUILD_BUILDID', 'BUILD_SOURCEVERSION', 'BUILD_SOURCEBRANCH', 'BUILD_SOURCESDIRECTORY',
	'AGENT_BUILDDIRECTORY', 'AGENT_TEMPDIRECTORY', 'VSCODE_ARCH', 'VSCODE_QUALITY',
	'VSCODE_CIBUILD', 'VSCODE_PUBLISH', 'VSCODE_STEP_ON_IT',
] as const;

type Input = (typeof nativeExitProbeRequiredInputs)[number];

export class NativeExitProbeInputError extends Error {
	readonly input: Input;
	readonly reason: 'missing' | 'empty' | 'invalid';

	constructor(input: Input, reason: 'missing' | 'empty' | 'invalid') {
		super('Focused probe required-input validation failed');
		this.name = 'NativeExitProbeInputError';
		this.input = input;
		this.reason = reason;
	}
}

export function isNativeExitProbe(env: NodeJS.ProcessEnv): boolean {
	return env.VSCODE_NATIVE_EXIT_PROBE?.toLowerCase() === 'true';
}

export function validateNativeExitProbeInputs(env: NodeJS.ProcessEnv): void {
	for (const input of nativeExitProbeRequiredInputs) {
		const value = env[input];
		if (value === undefined) {
			throw new NativeExitProbeInputError(input, 'missing');
		}
		if (value.trim().length === 0) {
			throw new NativeExitProbeInputError(input, 'empty');
		}
	}
	for (const [input, expected] of [
		['VSCODE_ARCH', 'x64'], ['VSCODE_QUALITY', 'insider'], ['VSCODE_CIBUILD', 'true'],
		['VSCODE_PUBLISH', 'false'], ['VSCODE_STEP_ON_IT', 'false'],
	] as const) {
		if (env[input]?.toLowerCase() !== expected) {
			throw new NativeExitProbeInputError(input, 'invalid');
		}
	}
	for (const [input, pattern] of [
		['BUILD_BUILDID', /^[1-9]\d*$/],
		['BUILD_SOURCEVERSION', /^[a-f0-9]{40}$/],
		['BUILD_SOURCEBRANCH', /^refs\/heads\/[A-Za-z0-9_./-]+$/],
	] as const) {
		if (!pattern.test(env[input]!)) {
			throw new NativeExitProbeInputError(input, 'invalid');
		}
	}
	const expected = `${env.SYSTEM_COLLECTIONURI}${env.SYSTEM_TEAMPROJECT}/_apis/build/builds/${env.BUILD_BUILDID}/`;
	if (env.BUILDS_API_URL !== expected) {
		throw new NativeExitProbeInputError('BUILDS_API_URL', 'invalid');
	}
	let url: URL;
	try {
		url = new URL(env.BUILDS_API_URL);
	} catch {
		throw new NativeExitProbeInputError('BUILDS_API_URL', 'invalid');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
		throw new NativeExitProbeInputError('BUILDS_API_URL', 'invalid');
	}
}

if (import.meta.main) {
	try {
		if (process.argv[2] !== '--check') {
			throw new Error('Expected --check');
		}
		validateNativeExitProbeInputs(process.env);
		console.log(JSON.stringify({ phase: 'required-inputs', pass: true }));
	} catch (error) {
		console.log(JSON.stringify({
			phase: 'required-inputs', pass: false,
			...(error instanceof NativeExitProbeInputError ? { input: error.input, reason: error.reason } : { reason: 'invalid-command' }),
		}));
		process.exitCode = 1;
	}
}
