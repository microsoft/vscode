/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
const fs = require('fs');
const path = require('path');

const nls = {
	'openDashboard': 'Gitpod: Open Dashboard',
	'openAccessControl': 'Gitpod: Open Access Control',
	'openSettings': 'Gitpod: Open Settings',
	'openContext': 'Gitpod: Open Context',
	'openDocumentation': 'Gitpod: Documentation',
	'openDiscord': 'Gitpod: Open Community Chat',
	'openTwitter': 'Gitpod: Follow us on Twitter',
	'reportIssue': 'Gitpod: Report Issue',
	'stopWorkspace': 'Gitpod: Stop Workspace',
	'upgradeSubscription': 'Gitpod: Upgrade Subscription',
	'extendTimeout': 'Gitpod: Extend Workspace Timeout',
	'takeSnapshot': 'Gitpod: Share Workspace Snapshot',
	'shareWorkspace': 'Gitpod: Share Running Workspace',
	'stopSharingWorkspace': 'Gitpod: Stop Sharing Running Workspace',
	'openInStable': 'Gitpod: Open in VS Code',
	'openInInsiders': 'Gitpod: Open in VS Code Insiders',
	'openInBrowser': 'Gitpod: Open in Browser'
};

const commands = [
	{
		'command': 'gitpod.stop.ws',
		'title': '%stopWorkspace%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.open.settings',
		'title': '%openSettings%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.accessControl',
		'title': '%openAccessControl%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.context',
		'title': '%openContext%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.dashboard',
		'title': '%openDashboard%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.documentation',
		'title': '%openDocumentation%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.twitter',
		'title': '%openTwitter%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.discord',
		'title': '%openDiscord%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.reportIssue',
		'title': '%reportIssue%',
		'enablement': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.upgradeSubscription',
		'title': '%upgradeSubscription%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.ExtendTimeout',
		'title': '%extendTimeout%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.takeSnapshot',
		'title': '%takeSnapshot%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.shareWorkspace',
		'title': '%shareWorkspace%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true && gitpod.workspaceShared == false'
	},
	{
		'command': 'gitpod.stopSharingWorkspace',
		'title': '%stopSharingWorkspace%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true && gitpod.workspaceShared == true'
	},
	{
		'command': 'gitpod.openInStable',
		'title': '%openInStable%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.UIKind == \'web\''
	},
	{
		'command': 'gitpod.openInInsiders',
		'title': '%openInInsiders%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.UIKind == \'web\''
	},
	{
		'command': 'gitpod.openInBrowser',
		'title': '%openInBrowser%',
		'enablement': 'gitpod.inWorkspace == true && gitpod.UIKind == \'desktop\''
	}
];

const remoteMenus = [
	{
		'command': 'gitpod.stop.ws',
		'group': 'remote_00_gitpod_navigation@10',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.open.settings',
		'group': 'remote_00_gitpod_navigation@20',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.accessControl',
		'group': 'remote_00_gitpod_navigation@30',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.context',
		'group': 'remote_00_gitpod_navigation@40',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.dashboard',
		'group': 'remote_00_gitpod_navigation@50',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.documentation',
		'group': 'remote_00_gitpod_navigation@60',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.twitter',
		'group': 'remote_00_gitpod_navigation@70',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.open.discord',
		'group': 'remote_00_gitpod_navigation@80',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.reportIssue',
		'group': 'remote_00_gitpod_navigation@90',
		'when': 'gitpod.inWorkspace == true'
	},
	{
		'command': 'gitpod.upgradeSubscription',
		'group': 'remote_00_gitpod_navigation@100',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.ExtendTimeout',
		'group': 'remote_00_gitpod_navigation@110',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.takeSnapshot',
		'group': 'remote_00_gitpod_navigation@120',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true'
	},
	{
		'command': 'gitpod.shareWorkspace',
		'group': 'remote_00_gitpod_navigation@130',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true && gitpod.workspaceShared == false'
	},
	{
		'command': 'gitpod.stopSharingWorkspace',
		'group': 'remote_00_gitpod_navigation@130',
		'when': 'gitpod.inWorkspace == true && gitpod.workspaceOwned == true && gitpod.workspaceShared == true'
	},
	{
		'command': 'gitpod.openInStable',
		'group': 'remote_00_gitpod_navigation@900',
		'when': 'gitpod.inWorkspace == true && gitpod.UIKind == \'web\''
	},
	{
		'command': 'gitpod.openInInsiders',
		'group': 'remote_00_gitpod_navigation@1000',
		'when': 'gitpod.inWorkspace == true && gitpod.UIKind == \'web\''
	},
	{
		'command': 'gitpod.openInBrowser',
		'group': 'remote_00_gitpod_navigation@1000',
		'when': 'gitpod.inWorkspace == true && gitpod.UIKind == \'desktop\''
	}
];

function inflateManifest(manifest) {
	const contributes = manifest.contributes = (manifest.contributes || {});
	contributes.commands = (contributes.commands || []).filter(c => commands.findIndex(c2 => c.command === c2.command) === -1);
	contributes.commands.unshift(...commands);
	const menus = contributes.menus = (contributes.menus || {});
	menus['statusBar/remoteIndicator'] = (menus['statusBar/remoteIndicator'] || []).filter(m => remoteMenus.findIndex(m2 => m.command === m2.command) === -1);
	menus['statusBar/remoteIndicator'].unshift(...remoteMenus);
}

function main() {
	const workspacePath = path.resolve(__dirname, '..', '..');
	for (const name of ['gitpod-remote', 'gitpod-web']) {
		const manifestPath = path.resolve(workspacePath, name, 'package.json');
		const pckContent = fs.readFileSync(manifestPath, { encoding: 'utf-8' });
		const manifest = JSON.parse(pckContent);
		inflateManifest(manifest);
		fs.writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2), { encoding: 'utf-8' });

		const nlsPath = path.resolve(workspacePath, name, 'package.nls.json');
		const nlsContent = fs.readFileSync(nlsPath, { encoding: 'utf-8' });
		fs.writeFileSync(nlsPath, JSON.stringify({
			...JSON.parse(nlsContent), ...nls
		}, undefined, '\t'), { encoding: 'utf-8' });
	}
}

main();
