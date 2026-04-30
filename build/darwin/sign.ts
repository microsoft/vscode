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

const mainProvisioningProfilePath = path.join(baseDir, 'darwin', 'main.provisionprofile');
const agentsProvisioningProfilePath = path.join(baseDir, 'darwin', 'agents.provisionprofile');

function hasProvisioningProfile(): boolean {
	return fs.existsSync(mainProvisioningProfilePath);
}

function getEntitlementsForFile(filePath: string, tempDir: string, useProvisioningProfile: boolean, teamId?: string): string {
	if (filePath.includes(' Helper (GPU).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist');
	} else if (filePath.includes(' Helper (Renderer).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist');
	} else if (filePath.includes(' Helper (Plugin).app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist');
	} else if (filePath.includes(' Helper.app')) {
		return path.join(baseDir, 'azure-pipelines', 'darwin', 'helper-entitlements.plist');
	}
	const entitlementsPath = path.join(baseDir, 'azure-pipelines', 'darwin', 'app-entitlements.plist');
	if (!useProvisioningProfile) {
		// Without a provisioning profile, keychain-access-groups entitlement
		// will cause signing failures. Strip it from the entitlements plist.
		return getStrippedEntitlements(entitlementsPath, tempDir);
	}
	if (teamId) {
		return getExpandedEntitlements(entitlementsPath, tempDir, teamId);
	}
	return entitlementsPath;
}

let _strippedEntitlementsPath: string | undefined;

/**
 * Returns a path to a copy of the entitlements plist with the
 * keychain-access-groups key removed.
 */
function getStrippedEntitlements(entitlementsPath: string, tempDir: string): string {
	if (!_strippedEntitlementsPath) {
		const content = fs.readFileSync(entitlementsPath, 'utf8');
		const stripped = content.replace(
			/\s*<key>keychain-access-groups<\/key>\s*<array>[\s\S]*?<\/array>/,
			''
		);
		_strippedEntitlementsPath = path.join(tempDir, 'app-entitlements-stripped.plist');
		fs.writeFileSync(_strippedEntitlementsPath, stripped);
	}
	return _strippedEntitlementsPath;
}

let expandedEntitlementsPath: string | undefined;

/**
 * Returns a path to a copy of the entitlements plist with
 * $(TeamIdentifierPrefix) expanded to the actual team identifier.
 */
function getExpandedEntitlements(entitlementsPath: string, tempDir: string, teamId: string): string {
	if (!expandedEntitlementsPath) {
		const content = fs.readFileSync(entitlementsPath, 'utf8');
		const expanded = content.replace(/\$\(TeamIdentifierPrefix\)/g, teamId + '.');
		expandedEntitlementsPath = path.join(tempDir, 'app-entitlements.plist');
		fs.writeFileSync(expandedEntitlementsPath, expanded);
	}
	return expandedEntitlementsPath;
}

async function retrySignOnKeychainError<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			// Check if this is the specific keychain error we want to retry
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isKeychainError = errorMessage.includes('The specified item could not be found in the keychain.');

			if (!isKeychainError || attempt === maxRetries) {
				throw error;
			}

			console.log(`Signing attempt ${attempt} failed with keychain error, retrying...`);
			console.log(`Error: ${errorMessage}`);

			const delay = 1000 * Math.pow(2, attempt - 1);
			console.log(`Waiting ${Math.round(delay)}ms before retry ${attempt}/${maxRetries}...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

async function main(buildDir?: string, skipProvisioningProfile?: boolean): Promise<void> {
	const tempDir = process.env['AGENT_TEMPDIRECTORY'];
	const arch = process.env['VSCODE_ARCH'];
	const identity = process.env['CODESIGN_IDENTITY'];

	if (!buildDir) {
		throw new Error('$AGENT_BUILDDIRECTORY not set');
	}

	if (!tempDir) {
		throw new Error('$AGENT_TEMPDIRECTORY not set');
	}

	const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
	const appName = product.nameLong + '.app';
	const infoPlistPath = path.resolve(appRoot, appName, 'Contents', 'Info.plist');
	const embeddedInfoPlistPath = product.embedded
		? path.resolve(appRoot, appName, 'Contents', 'Applications', `${product.embedded.nameLong}.app`, 'Contents', 'Info.plist')
		: undefined;

	const useProvisioningProfile = !skipProvisioningProfile && hasProvisioningProfile();
	const resolvedProvisioningProfile = useProvisioningProfile ? mainProvisioningProfilePath : undefined;

	let teamId: string | undefined;
	if (resolvedProvisioningProfile) {
		const profilePlist = await spawn('security', ['cms', '-D', '-i', resolvedProvisioningProfile]);
		const teamIdMatch = /<key>TeamIdentifier<\/key>\s*<array>\s*<string>(.*?)<\/string>/s.exec(profilePlist);
		if (teamIdMatch) {
			teamId = teamIdMatch[1];
			console.log(`Extracted TeamIdentifier from provisioning profile: ${teamId}`);
		} else {
			console.warn('Could not extract TeamIdentifier from provisioning profile; $(TeamIdentifierPrefix) will not be expanded');
		}
	}

	// Embed the agents provisioning profile into the embedded app bundle
	// before signing, since @electron/osx-sign only supports one top-level profile.
	if (useProvisioningProfile && product.embedded && fs.existsSync(agentsProvisioningProfilePath)) {
		const embeddedAppPath = path.join(appRoot, appName, 'Contents', 'Applications', `${product.embedded.nameLong}.app`);
		if (fs.existsSync(embeddedAppPath)) {
			const embeddedProfileDest = path.join(embeddedAppPath, 'Contents', 'embedded.provisionprofile');
			fs.copyFileSync(agentsProvisioningProfilePath, embeddedProfileDest);
			console.log(`Embedded agents provisioning profile into ${embeddedProfileDest}`);
		}
	}

	const appOpts: SignOptions = {
		app: path.join(appRoot, appName),
		platform: 'darwin',
		optionsForFile: (filePath) => ({
			entitlements: getEntitlementsForFile(filePath, tempDir, useProvisioningProfile, teamId),
			hardenedRuntime: true,
		}),
		preAutoEntitlements: false,
		preEmbedProvisioningProfile: !!resolvedProvisioningProfile,
		provisioningProfile: resolvedProvisioningProfile,
		keychain: path.join(tempDir, 'buildagent.keychain'),
		version: getElectronVersion(),
		identity,
	};

	// Only overwrite plist entries for x64 and arm64 builds,
	// universal will get its copy from the x64 build.
	// Skip when re-signing (skipProvisioningProfile) since entries already exist.
	if (arch !== 'universal' && !skipProvisioningProfile) {
		await spawn('plutil', [
			'-insert',
			'NSAppleEventsUsageDescription',
			'-string',
			'An application in Visual Studio Code wants to use AppleScript.',
			`${infoPlistPath}`
		]);
		await spawn('plutil', [
			'-replace',
			'NSMicrophoneUsageDescription',
			'-string',
			'An application in Visual Studio Code wants to use the Microphone.',
			`${infoPlistPath}`
		]);
		await spawn('plutil', [
			'-replace',
			'NSCameraUsageDescription',
			'-string',
			'An application in Visual Studio Code wants to use the Camera.',
			`${infoPlistPath}`
		]);
		await spawn('plutil', [
			'-replace',
			'NSAudioCaptureUsageDescription',
			'-string',
			'An application in Visual Studio Code wants to use Audio Capture.',
			`${infoPlistPath}`
		]);
		await spawn('plutil', [
			'-insert',
			'NSLocalNetworkUsageDescription',
			'-string',
			'The app uses your local network for DNS resolution and to connect to locally running services.',
			`${infoPlistPath}`
		]);

		if (embeddedInfoPlistPath && fs.existsSync(embeddedInfoPlistPath)) {
			await spawn('plutil', [
				'-insert',
				'NSAppleEventsUsageDescription',
				'-string',
				`An application in ${product.embedded.nameLong} wants to use AppleScript.`,
				`${embeddedInfoPlistPath}`
			]);
			await spawn('plutil', [
				'-replace',
				'NSMicrophoneUsageDescription',
				'-string',
				`An application in ${product.embedded.nameLong} wants to use the Microphone.`,
				`${embeddedInfoPlistPath}`
			]);
			await spawn('plutil', [
				'-replace',
				'NSCameraUsageDescription',
				'-string',
				`An application in ${product.embedded.nameLong} wants to use the Camera.`,
				`${embeddedInfoPlistPath}`
			]);
			await spawn('plutil', [
				'-replace',
				'NSAudioCaptureUsageDescription',
				'-string',
				`An application in ${product.embedded.nameLong} wants to use Audio Capture.`,
				`${embeddedInfoPlistPath}`
			]);
			await spawn('plutil', [
				'-insert',
				'NSLocalNetworkUsageDescription',
				'-string',
				`The app uses your local network for DNS resolution and to connect to locally running services.`,
				`${embeddedInfoPlistPath}`
			]);
		}
	}

	await retrySignOnKeychainError(() => sign(appOpts));
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const skipProvisioningProfile = args.includes('--skip-provisioning-profile');
	const buildDir = args.filter(a => !a.startsWith('--'))[0];
	main(buildDir, skipProvisioningProfile).catch(async err => {
		console.error(err);
		const tempDir = process.env['AGENT_TEMPDIRECTORY'];
		if (tempDir) {
			const keychain = path.join(tempDir, 'buildagent.keychain');
			const identities = await spawn('security', ['find-identity', '-p', 'codesigning', '-v', keychain]);
			console.error(`Available identities:\n${identities}`);
			const dump = await spawn('security', ['dump-keychain', keychain]);
			console.error(`Keychain dump:\n${dump}`);
		}
		process.exit(1);
	});
}
