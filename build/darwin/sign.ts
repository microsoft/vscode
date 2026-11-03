/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { sign, type SignOptions } from '@electron/osx-sign';
import { spawn } from '@malept/cross-spawn-promise';

const root = path.dirname(path.dirname(import.meta.dirname));
const baseDir = path.dirname(import.meta.dirname);
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));

function getElectronVersion(): string {
	const npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8');
	const target = /^target="(.*)"$/m.exec(npmrc)![1];
	return target;
}

function getEntitlementsForFile(filePath: string): string {
	if (filePath.includes(' Helper (GPU).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist');
	} else if (filePath.includes(' Helper (Renderer).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist');
	} else if (filePath.includes(' Helper (Plugin).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist');
	} else if (filePath.includes(' Helper.app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-entitlements.plist');
	}
	return path.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist');
}

function getKeychainPath(tempDir: string): string {
	return path.join(tempDir, 'buildagent.keychain');
}

/**
 * Usage descriptions shown by macOS when the app requests access to protected resources.
 */
const infoPlistUsageDescriptions: Record<string, string> = {
	NSAppleEventsUsageDescription: 'An application in Visual Studio Code wants to use AppleScript.',
	NSMicrophoneUsageDescription: 'An application in Visual Studio Code wants to use the Microphone.',
	NSCameraUsageDescription: 'An application in Visual Studio Code wants to use the Camera.',
	NSAudioCaptureUsageDescription: 'An application in Visual Studio Code wants to use Audio Capture.',
	NSLocalNetworkUsageDescription: 'The app uses your local network for DNS resolution and to connect to locally running services.',
};

/**
 * `codesign` errors caused by short-lived problems on the build agent (keychain access)
 * or in Apple's timestamp service, which usually clear up within seconds.
 */
const transientSignErrors = [
	'The specified item could not be found in the keychain.',
	'A timestamp was expected but was not found.',
	'The timestamp service is not available.',
];

/**
 * Runs `fn`, retrying with exponential backoff when it fails with one of the
 * {@link transientSignErrors}. Signing the app again is safe because every file
 * is signed with `codesign --force`, which replaces existing signatures.
 */
export async function retryOnTransientSignError<T>(fn: () => Promise<T>, maxAttempts = 5, initialDelayMs = 10_000): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (attempt >= maxAttempts || !transientSignErrors.some(transientError => message.includes(transientError))) {
				throw error;
			}

			const delayMs = initialDelayMs * 2 ** (attempt - 1);
			console.log(`Signing attempt ${attempt}/${maxAttempts} failed with a transient error, retrying in ${delayMs / 1000}s...`);
			console.log(`Error: ${message}`);
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}
}

async function main(buildDir?: string): Promise<void> {
	const tempDir = process.env['AGENT_TEMPDIRECTORY'];
	const arch = process.env['VSCODE_ARCH'];
	const identity = process.env['CODESIGN_IDENTITY'];

	if (!buildDir) {
		throw new Error('$AGENT_BUILDDIRECTORY not set');
	}

	if (!tempDir) {
		throw new Error('$AGENT_TEMPDIRECTORY not set');
	}

	if (!arch) {
		throw new Error('$VSCODE_ARCH not set');
	}

	const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
	const appName = product.nameLong + '.app';
	const infoPlistPath = path.resolve(appRoot, appName, 'Contents', 'Info.plist');

	const appOpts: SignOptions = {
		app: path.join(appRoot, appName),
		platform: 'darwin',
		optionsForFile: (filePath) => ({
			entitlements: getEntitlementsForFile(filePath),
			hardenedRuntime: true,
		}),
		preAutoEntitlements: false,
		preEmbedProvisioningProfile: false,
		keychain: getKeychainPath(tempDir),
		version: getElectronVersion(),
		identity,
	};

	// Only overwrite plist entries for x64 and arm64 builds,
	// universal will get its copy from the x64 build.
	if (arch !== 'universal') {
		// `-replace` adds missing keys and overwrites existing ones, so signing the same app again does not fail
		for (const [key, value] of Object.entries(infoPlistUsageDescriptions)) {
			await spawn('plutil', ['-replace', key, '-string', value, infoPlistPath]);
		}
	}

	await retryOnTransientSignError(() => sign(appOpts));
}

async function printKeychainDiagnostics(): Promise<void> {
	const tempDir = process.env['AGENT_TEMPDIRECTORY'];
	if (!tempDir) {
		return;
	}

	const keychain = getKeychainPath(tempDir);
	try {
		const identities = await spawn('security', ['find-identity', '-p', 'codesigning', '-v', keychain]);
		console.error(`Available identities:\n${identities}`);
		const dump = await spawn('security', ['dump-keychain', keychain]);
		console.error(`Keychain dump:\n${dump}`);
	} catch (err) {
		console.error('Failed to collect keychain diagnostics:', err);
	}
}

if (import.meta.main) {
	main(process.argv[2]).catch(async err => {
		console.error(err);
		await printKeychainDiagnostics();
		process.exit(1);
	});
}
