/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// make sure we install the deps of build for the system installed
// node, since that is the driver of gulp
function setupBuildNpmrc(env) {
	env['npm_config_disturl'] = "https://nodejs.org/dist";
	env['npm_config_target'] = process.versions.node;
	env['npm_config_runtime'] = "node";
	env['npm_config_legacy_peer_deps'] = "true";
	env['npm_config_build_from_source'] = "true";
	env['npm_config_arch'] = process.arch;
}

function setupRemoteNpmrc(env) {
	env['npm_config_disturl'] = "https://nodejs.org/dist";
	env['npm_config_target'] = "20.15.1";
	env['npm_config_runtime'] = "node";
	env['npm_config_ms_build_id'] = "287145";
	env['npm_config_legacy_peer_deps'] = "true";
	env['npm_config_build_from_source'] = "true";
	env['npm_config_timeout'] = 180000;
}

function getRemoteVersionInfo() {
	return {
		target: "20.15.1",
		disturl: "https://nodejs.org/dist",
		ms_build_id: "287145",
		runtime: "node"
	}
}

exports.setupBuildNpmrc = setupBuildNpmrc;
exports.setupRemoteNpmrc = setupRemoteNpmrc;
exports.getRemoteVersionInfo = getRemoteVersionInfo;

if (require.main === module) {
	setupBuildNpmrc(process.env);
}
