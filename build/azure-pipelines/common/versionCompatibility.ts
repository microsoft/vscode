/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

export interface IExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	engines: { vscode: string };
	main?: string;
	browser?: string;
	enabledApiProposals?: string[];
}

export function isEngineCompatible(productVersion: string, engineVersion: string): { compatible: boolean; error?: string } {
	if (engineVersion === '*') {
		return { compatible: true };
	}

	const versionMatch = engineVersion.match(/^(\^|>=)?(\d+)\.(\d+)\.(\d+)/);
	if (!versionMatch) {
		return { compatible: false, error: `Could not parse engines.vscode value: ${engineVersion}` };
	}

	const [, prefix, major, minor, patch] = versionMatch;
	const productMatch = productVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!productMatch) {
		return { compatible: false, error: `Could not parse product version: ${productVersion}` };
	}

	const [, prodMajor, prodMinor, prodPatch] = productMatch;

	const reqMajor = parseInt(major);
	const reqMinor = parseInt(minor);
	const reqPatch = parseInt(patch);
	const pMajor = parseInt(prodMajor);
	const pMinor = parseInt(prodMinor);
	const pPatch = parseInt(prodPatch);

	if (prefix === '>=') {
		// Minimum version check
		if (pMajor > reqMajor) { return { compatible: true }; }
		if (pMajor < reqMajor) { return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` }; }
		if (pMinor > reqMinor) { return { compatible: true }; }
		if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` }; }
		if (pPatch >= reqPatch) { return { compatible: true }; }
		return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` };
	}

	// Caret or exact version check
	if (pMajor !== reqMajor) {
		return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion} (major version mismatch)` };
	}

	if (prefix === '^') {
		// Caret: same major, minor and patch must be >= required
		if (pMinor > reqMinor) { return { compatible: true }; }
		if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` }; }
		if (pPatch >= reqPatch) { return { compatible: true }; }
		return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` };
	}

	// Exact or default behavior
	if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` }; }
	if (pMinor > reqMinor) { return { compatible: true }; }
	if (pPatch >= reqPatch) { return { compatible: true }; }
	return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` };
}

export function parseApiProposals(enabledApiProposals: string[]): { proposalName: string; version?: number }[] {
	return enabledApiProposals.map(proposal => {
		const [proposalName, version] = proposal.split('@');
		return { proposalName, version: version ? parseInt(version) : undefined };
	});
}

export function areApiProposalsCompatible(
	apiProposals: string[],
	productApiProposals: Readonly<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>
): { compatible: boolean; errors: string[] } {
	if (apiProposals.length === 0) {
		return { compatible: true, errors: [] };
	}

	const errors: string[] = [];
	const parsedProposals = parseApiProposals(apiProposals);

	for (const { proposalName, version } of parsedProposals) {
		if (!version) {
			continue;
		}
		const existingProposal = productApiProposals[proposalName];
		if (!existingProposal) {
			errors.push(`API proposal '${proposalName}' does not exist in this version of VS Code`);
		} else if (existingProposal.version !== version) {
			errors.push(`API proposal '${proposalName}' version mismatch: extension requires version ${version}, but VS Code has version ${existingProposal.version ?? 'unversioned'}`);
		}
	}

	return { compatible: errors.length === 0, errors };
}

export function parseApiProposalsFromSource(content: string): { [proposalName: string]: { proposal: string; version?: number } } {
	const allApiProposals: { [proposalName: string]: { proposal: string; version?: number } } = {};

	// Match proposal blocks like: proposalName: {\n\t\tproposal: '...',\n\t\tversion: N\n\t}
	// or: proposalName: {\n\t\tproposal: '...',\n\t}
	const proposalBlockRegex = /\t(\w+):\s*\{([^}]+)\}/g;
	const versionRegex = /version:\s*(\d+)/;

	let match;
	while ((match = proposalBlockRegex.exec(content)) !== null) {
		const [, name, block] = match;
		const versionMatch = versionRegex.exec(block);
		allApiProposals[name] = {
			proposal: '',
			version: versionMatch ? parseInt(versionMatch[1]) : undefined
		};
	}

	return allApiProposals;
}

export function areAllowlistedApiProposalsMatching(
	extensionId: string,
	productAllowlistedProposals: string[] | undefined,
	manifestEnabledProposals: string[] | undefined
): { compatible: boolean; errors: string[] } {
	// Normalize undefined to empty arrays for easier comparison
	const productProposals = productAllowlistedProposals || [];
	const manifestProposals = manifestEnabledProposals || [];

	// If extension doesn't declare any proposals, it's always compatible
	// (product.json can allowlist more than the extension uses)
	if (manifestProposals.length === 0) {
		return { compatible: true, errors: [] };
	}

	// If extension declares API proposals but product.json doesn't allowlist them
	if (productProposals.length === 0) {
		return {
			compatible: false,
			errors: [
				`Extension '${extensionId}' declares API proposals in package.json (${manifestProposals.join(', ')}) ` +
				`but product.json does not allowlist any API proposals for this extension`
			]
		};
	}

	// Check that all proposals in manifest are allowlisted in product.json
	// (product.json can have extra proposals that the extension doesn't use)
	// Note: Strip version suffixes from manifest proposals (e.g., "chatParticipant@2" -> "chatParticipant")
	// because product.json only contains base proposal names
	const productSet = new Set(productProposals);
	const errors: string[] = [];

	for (const proposal of manifestProposals) {
		// Strip version suffix if present (e.g., "chatParticipant@2" -> "chatParticipant")
		const proposalName = proposal.split('@')[0];
		if (!productSet.has(proposalName)) {
			errors.push(`API proposal '${proposal}' is declared in extension '${extensionId}' package.json but is not allowlisted in product.json`);
		}
	}

	return { compatible: errors.length === 0, errors };
}

export function checkExtensionCompatibility(
	productVersion: string,
	productApiProposals: Readonly<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>,
	manifest: IExtensionManifest
): { compatible: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check engine compatibility
	const engineResult = isEngineCompatible(productVersion, manifest.engines.vscode);
	if (!engineResult.compatible) {
		errors.push(engineResult.error!);
	}

	// Check API proposals compatibility
	if (manifest.enabledApiProposals?.length) {
		const apiResult = areApiProposalsCompatible(manifest.enabledApiProposals, productApiProposals);
		if (!apiResult.compatible) {
			errors.push(...apiResult.errors);
		}
	}

	return { compatible: errors.length === 0, errors };
}

if (import.meta.main) {
	console.log('Running version compatibility tests...\n');

	// isEngineCompatible tests
	console.log('Testing isEngineCompatible...');

	// Wildcard
	assert.strictEqual(isEngineCompatible('1.50.0', '*').compatible, true);

	// Invalid engine version
	assert.strictEqual(isEngineCompatible('1.50.0', 'invalid').compatible, false);

	// Invalid product version
	assert.strictEqual(isEngineCompatible('invalid', '1.50.0').compatible, false);

	// >= prefix
	assert.strictEqual(isEngineCompatible('1.50.0', '>=1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.50.1', '>=1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.51.0', '>=1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('2.0.0', '>=1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.49.0', '>=1.50.0').compatible, false);
	assert.strictEqual(isEngineCompatible('1.50.0', '>=1.50.1').compatible, false);
	assert.strictEqual(isEngineCompatible('0.50.0', '>=1.50.0').compatible, false);

	// ^ prefix (caret)
	assert.strictEqual(isEngineCompatible('1.50.0', '^1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.50.1', '^1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.51.0', '^1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.49.0', '^1.50.0').compatible, false);
	assert.strictEqual(isEngineCompatible('1.50.0', '^1.50.1').compatible, false);
	assert.strictEqual(isEngineCompatible('2.0.0', '^1.50.0').compatible, false);

	// Exact/default (no prefix)
	assert.strictEqual(isEngineCompatible('1.50.0', '1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.50.1', '1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.51.0', '1.50.0').compatible, true);
	assert.strictEqual(isEngineCompatible('1.49.0', '1.50.0').compatible, false);
	assert.strictEqual(isEngineCompatible('1.50.0', '1.50.1').compatible, false);
	assert.strictEqual(isEngineCompatible('2.0.0', '1.50.0').compatible, false);

	console.log('  ✓ isEngineCompatible tests passed\n');

	// parseApiProposals tests
	console.log('Testing parseApiProposals...');

	assert.deepStrictEqual(parseApiProposals([]), []);
	assert.deepStrictEqual(parseApiProposals(['proposalA']), [{ proposalName: 'proposalA', version: undefined }]);
	assert.deepStrictEqual(parseApiProposals(['proposalA@1']), [{ proposalName: 'proposalA', version: 1 }]);
	assert.deepStrictEqual(parseApiProposals(['proposalA@1', 'proposalB', 'proposalC@3']), [
		{ proposalName: 'proposalA', version: 1 },
		{ proposalName: 'proposalB', version: undefined },
		{ proposalName: 'proposalC', version: 3 }
	]);

	console.log('  ✓ parseApiProposals tests passed\n');

	// areApiProposalsCompatible tests
	console.log('Testing areApiProposalsCompatible...');

	const productProposals = {
		proposalA: { proposal: '', version: 1 },
		proposalB: { proposal: '', version: 2 },
		proposalC: { proposal: '' } // unversioned
	};

	// Empty proposals
	assert.strictEqual(areApiProposalsCompatible([], productProposals).compatible, true);

	// Unversioned extension proposals (always compatible)
	assert.strictEqual(areApiProposalsCompatible(['proposalA', 'proposalB'], productProposals).compatible, true);
	assert.strictEqual(areApiProposalsCompatible(['unknownProposal'], productProposals).compatible, true);

	// Versioned proposals - matching
	assert.strictEqual(areApiProposalsCompatible(['proposalA@1'], productProposals).compatible, true);
	assert.strictEqual(areApiProposalsCompatible(['proposalA@1', 'proposalB@2'], productProposals).compatible, true);

	// Versioned proposals - version mismatch
	assert.strictEqual(areApiProposalsCompatible(['proposalA@2'], productProposals).compatible, false);
	assert.strictEqual(areApiProposalsCompatible(['proposalB@1'], productProposals).compatible, false);

	// Versioned proposals - missing proposal
	assert.strictEqual(areApiProposalsCompatible(['unknownProposal@1'], productProposals).compatible, false);

	// Versioned proposals - product has unversioned
	assert.strictEqual(areApiProposalsCompatible(['proposalC@1'], productProposals).compatible, false);

	// Mixed versioned and unversioned
	assert.strictEqual(areApiProposalsCompatible(['proposalA@1', 'proposalB'], productProposals).compatible, true);
	assert.strictEqual(areApiProposalsCompatible(['proposalA@2', 'proposalB'], productProposals).compatible, false);

	console.log('  ✓ areApiProposalsCompatible tests passed\n');

	// parseApiProposalsFromSource tests
	console.log('Testing parseApiProposalsFromSource...');

	const sampleSource = `
export const allApiProposals = {
	authSession: {
		proposal: 'vscode.proposed.authSession.d.ts',
	},
	chatParticipant: {
		proposal: 'vscode.proposed.chatParticipant.d.ts',
		version: 2
	},
	testProposal: {
		proposal: 'vscode.proposed.testProposal.d.ts',
		version: 15
	}
};
`;

	const parsedSource = parseApiProposalsFromSource(sampleSource);
	assert.strictEqual(Object.keys(parsedSource).length, 3);
	assert.strictEqual(parsedSource['authSession']?.version, undefined);
	assert.strictEqual(parsedSource['chatParticipant']?.version, 2);
	assert.strictEqual(parsedSource['testProposal']?.version, 15);

	// Empty source
	assert.strictEqual(Object.keys(parseApiProposalsFromSource('')).length, 0);

	console.log('  ✓ parseApiProposalsFromSource tests passed\n');

	// checkExtensionCompatibility tests
	console.log('Testing checkExtensionCompatibility...');

	const testApiProposals = {
		authSession: { proposal: '', version: undefined },
		chatParticipant: { proposal: '', version: 2 },
		testProposal: { proposal: '', version: 15 }
	};

	// Compatible extension - matching engine and proposals
	assert.strictEqual(checkExtensionCompatibility('1.90.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['chatParticipant@2']
	}).compatible, true);

	// Compatible - no API proposals
	assert.strictEqual(checkExtensionCompatibility('1.90.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' }
	}).compatible, true);

	// Compatible - unversioned API proposals
	assert.strictEqual(checkExtensionCompatibility('1.90.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['authSession', 'chatParticipant']
	}).compatible, true);

	// Incompatible - engine version too new
	assert.strictEqual(checkExtensionCompatibility('1.89.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['chatParticipant@2']
	}).compatible, false);

	// Incompatible - API proposal version mismatch
	assert.strictEqual(checkExtensionCompatibility('1.90.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['chatParticipant@3']
	}).compatible, false);

	// Incompatible - missing API proposal
	assert.strictEqual(checkExtensionCompatibility('1.90.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['unknownProposal@1']
	}).compatible, false);

	// Incompatible - both engine and API proposal issues
	assert.strictEqual(checkExtensionCompatibility('1.89.0', testApiProposals, {
		name: 'test-ext',
		publisher: 'test',
		version: '1.0.0',
		engines: { vscode: '^1.90.0' },
		enabledApiProposals: ['chatParticipant@3']
	}).compatible, false);

	console.log('  ✓ checkExtensionCompatibility tests passed\n');

	// areAllowlistedApiProposalsMatching tests
	console.log('Testing areAllowlistedApiProposalsMatching...');

	// Both undefined - compatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', undefined, undefined).compatible, true);

	// Both empty arrays - compatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', [], []).compatible, true);

	// Exact match - compatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA', 'proposalB'], ['proposalA', 'proposalB']).compatible, true);

	// Match regardless of order - compatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalB', 'proposalA'], ['proposalA', 'proposalB']).compatible, true);

	// Extension declares but product.json doesn't allowlist - incompatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', undefined, ['proposalA']).compatible, false);
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', [], ['proposalA']).compatible, false);

	// Product.json allowlists but extension doesn't declare - COMPATIBLE (product.json can have extras)
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA'], undefined).compatible, true);
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA'], []).compatible, true);

	// Extension declares more than allowlisted - incompatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA'], ['proposalA', 'proposalB']).compatible, false);

	// Product.json allowlists more than declared - COMPATIBLE (product.json can have extras)
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA', 'proposalB'], ['proposalA']).compatible, true);

	// Completely different sets - incompatible (manifest has proposals not in allowlist)
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA'], ['proposalB']).compatible, false);

	// Product.json has extras and manifest matches subset - compatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA', 'proposalB', 'proposalC'], ['proposalA', 'proposalB']).compatible, true);

	// Versioned proposals - should strip version and match base name
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['chatParticipant'], ['chatParticipant@2']).compatible, true);
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA', 'proposalB'], ['proposalA@1', 'proposalB@3']).compatible, true);
	
	// Versioned proposal not in allowlist - incompatible
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA'], ['proposalB@2']).compatible, false);
	
	// Mix of versioned and unversioned proposals
	assert.strictEqual(areAllowlistedApiProposalsMatching('test.ext', ['proposalA', 'proposalB'], ['proposalA', 'proposalB@2']).compatible, true);

	console.log('  ✓ areAllowlistedApiProposalsMatching tests passed\n');

	console.log('All tests passed! ✓');
}
