/* eslint-disable header/header */

const path = require('path');
const fs = require('fs');
const https = require('https');

const pickKeys = [
	'extensionTips',
	'extensionImportantTips',
	'keymapExtensionTips',
	'configBasedExtensionTips',
	'extensionKeywords',
	'extensionAllowedBadgeProviders',
	'extensionAllowedBadgeProvidersRegex',
	'extensionAllowedProposedApi',
	'extensionEnabledApiProposals',
	'extensionKind',
	'languageExtensionTips'
];

const AllowMissKeys = [
	'win32SetupExeBasename',
	'darwinCredits',
	'darwinExecutable',
	'downloadUrl',
	'updateUrl',
	'webEndpointUrl',
	'webEndpointUrlTemplate',
	'quality',
	'exeBasedExtensionTips',
	'webExtensionTips',
	'remoteExtensionTips',
	'crashReporter',
	'appCenter',
	'enableTelemetry',
	'aiConfig',
	'msftInternalDomains',
	'sendASmile',
	'documentationUrl',
	'releaseNotesUrl',
	'keyboardShortcutsUrlMac',
	'keyboardShortcutsUrlLinux',
	'keyboardShortcutsUrlWin',
	'introductoryVideosUrl',
	'tipsAndTricksUrl',
	'newsletterSignupUrl',
	'twitterUrl',
	'requestFeatureUrl',
	'reportMarketplaceIssueUrl',
	'privacyStatementUrl',
	'showTelemetryOptOut',
	'npsSurveyUrl',
	'cesSurveyUrl',
	'checksumFailMoreInfoUrl',
	'electronRepository',
	'settingsSearchUrl',
	'surveys',
	'tasConfig',
	'experimentsUrl',
	'extensionSyncedKeys',
	'extensionVirtualWorkspacesSupport',
	'auth',
	'configurationSync.store',
	'commit',
	'date',
	'checksums',
	'settingsSearchBuildId',
	'darwinUniversalAssetId',
];

const propiertaryExtension = [
	'ms-vscode-remote.remote-containers',
	'ms-dotnettools.csharp',
	'ms-vscode.cpptools-extension-pack',
	'ms-azure-devops.azure-pipelines',
	'msazurermtools.azurerm-vscode-tools',
	'ms-azuretools.vscode-bicep',
	'usqlextpublisher.usql-vscode-ext',
	'ms-azuretools.vscode-azureterraform',
	'VisualStudioExptTeam.vscodeintellicode-completions',
	'ms-vsliveshare.vsliveshare',
	'ms-toolsai.vscode-ai-remote',
	'GitHub.codespaces',
	'ms-vscode.azure-repos',
	'ms-vscode.remote-repositories',
	'ms-vscode-remote.remote-wsl',
	'ms-vscode-remote.remote-ssh',
	'ms-vscode.remote-server',
	'GitHub.copilot',
	'GitHub.copilot-nightly',
	'GitHub.remotehub',
	'GitHub.remotehub-insiders',
	'ms-python.vscode-pylance',
	'ms-vscode.azure-sphere-tools-ui',
	'ms-azuretools.vscode-azureappservice',
];

const openvsxExtensionMap = {
	'ms-dotnettools.csharp': 'muhammad-sammy.csharp'
};

function filterObj(obj, predicate) {
	const result = Object.create(null);
	for (const [key, value] of Object.entries(obj)) {
		if (predicate(key, value)) {
			result[key] = value;
		}
	}
	return result;
}

function renameObjKey(obj, predicate) {
	const result = Object.create(null);
	for (const [key, value] of Object.entries(obj)) {
		const newKey = predicate(key, value) ?? key;
		result[newKey] = value;
	}
	return result;
}

async function start() {
	const localPath = path.join(__dirname, '../product.json');
	const releasePath = path.join(__dirname, '../product-release.json');
	if (!fs.existsSync(releasePath)) {
		console.error('product-release.json is not exists, please copy product.json from VSCode Desktop Stable');
		return;
	}

	const branchProduct = JSON.parse(await fs.promises.readFile(localPath, { encoding: 'utf8' }));
	const releaseProduct = JSON.parse(await fs.promises.readFile(releasePath, { encoding: 'utf8' }));
	const tmpProductPath = path.join(__dirname, '../product-tmp.json');
	for (let key of pickKeys) {
		let newValue = releaseProduct[key];
		if (Array.isArray(newValue) && newValue.length && typeof newValue[0] === 'string') {
			newValue = newValue.map(v => openvsxExtensionMap[v] ?? v).filter(v => !propiertaryExtension.includes(v));
		} else if (typeof newValue === 'object' && newValue !== null) {
			newValue = renameObjKey(newValue, k => openvsxExtensionMap[k] ?? k);
			newValue = filterObj(newValue, k => !propiertaryExtension.includes(k));
		}
		branchProduct[key] = newValue;
	}

	await fs.promises.writeFile(tmpProductPath, JSON.stringify(branchProduct, null, '\t'));

	if (keysDiff(branchProduct, releaseProduct)) {
		// allow-any-unicode-next-line
		console.log('📦 check if you need these keys or not');
	}
	await checkProductExtensions(branchProduct);
	// allow-any-unicode-next-line
	console.log('📦 you can copy product-tmp.json file to product.json file and resolve logs above by yourself');
	// allow-any-unicode-next-line
	console.log('✅ done');
}

function keysDiff(branch, release) {
	const toMap = (ret, e) => {
		ret[e] = true;
		return ret;
	};
	const map1 = Object.keys(branch).reduce(toMap, {});
	const map2 = Object.keys(release).reduce(toMap, {});
	let changed = false;
	for (let key in branch) {
		if (!!!map2[key]) {
			changed = true;
			// allow-any-unicode-next-line
			console.log(`🟠 Remove key: ${key}`);
		}
	}
	for (let key in release) {
		if (!!!map1[key] && !AllowMissKeys.includes(key)) {
			changed = true;
			// allow-any-unicode-next-line
			console.log(`🟠 Add key: ${key}`);
		}
	}
	return changed;
}

async function checkProductExtensions(product) {
	const uniqueExtIds = new Set();
	// Allow extension that downloaded from ms marketplace by users to use proposed api
	// uniqueExtIds.push(...product.extensionAllowedProposedApi);

	// Check recommand extension tips
	for (let key in product.configBasedExtensionTips) {
		Object.keys(product.configBasedExtensionTips[key].recommendations ?? {}).forEach(id => uniqueExtIds.add(id));
	}
	Object.keys(product.extensionImportantTips).forEach(id => uniqueExtIds.add(id));
	Object.keys(product.extensionTips).forEach(id => uniqueExtIds.add(id));
	Object.keys(product.extensionEnabledApiProposals).forEach(id => uniqueExtIds.add(id));
	product.keymapExtensionTips.forEach(id => uniqueExtIds.add(id));
	product.languageExtensionTips.forEach(id => uniqueExtIds.add(id));

	// Check if extensions exists in openvsx
	for (let id of uniqueExtIds) {
		if (propiertaryExtension.includes(id)) {
			continue;
		}

		const openvsxUrl = `https://open-vsx.org/api/${id.replace(/\./g, '/')}`;
		const ok = await urlExists(openvsxUrl);
		if (!ok) {
			// allow-any-unicode-next-line
			console.error(`🔴 Extension not exists: ${id}`);
		}
	}
}

async function urlExists(url) {
	return new Promise((resolve, reject) => {
		https.get(url, res => {
			resolve(res.statusCode === 200);
		}).on('error', error => {
			reject(error);
		});
	});
}

start().catch(console.error);
