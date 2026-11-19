/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from '../../common/workspaceTags.js';
import { getCargoDependencyNames } from '../../common/rustWorkspaceTags.js';

function hash(value: string): string {
	return crypto.createHash('sha256').update(value.toString()).digest('hex');
}

async function asyncHash(value: string): Promise<string> {
	return hash(value);
}

export async function getHashedRemotesFromConfig(text: string, stripEndingDotGit: boolean = false): Promise<string[]> {
	return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, remote => asyncHash(remote));
}

suite('Telemetry - WorkspaceTags', () => {

	test('Single remote hashed', async function () {
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git')), [hash('github3.com/username/repository.git')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git')), [hash('git.server.org/project.git')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git')), [hash('git.server.org/project.git')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git')), []);

		// Strip .git
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git'), true), [hash('github3.com/username/repository')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git'), true), [hash('git.server.org/project')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git'), true), [hash('git.server.org/project')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git'), true), []);

		// Compare Striped .git with no .git
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository.git'), true), await getHashedRemotesFromConfig(remote('https://username:password@github3.com/username/repository')));
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project.git'), true), await getHashedRemotesFromConfig(remote('ssh://user@git.server.org/project')));
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('user@git.server.org:project.git'), true), [hash('git.server.org/project')]);
		assert.deepStrictEqual(await getHashedRemotesFromConfig(remote('/opt/git/project.git'), true), await getHashedRemotesFromConfig(remote('/opt/git/project')));
	});

	test('Multiple remotes hashed', async function () {
		const config = ['https://github.com/microsoft/vscode.git', 'https://git.example.com/gitproject.git'].map(remote).join(' ');
		assert.deepStrictEqual(await getHashedRemotesFromConfig(config), [hash('github.com/microsoft/vscode.git'), hash('git.example.com/gitproject.git')]);

		// Strip .git
		assert.deepStrictEqual(await getHashedRemotesFromConfig(config, true), [hash('github.com/microsoft/vscode'), hash('git.example.com/gitproject')]);

		// Compare Striped .git with no .git
		const noDotGitConfig = ['https://github.com/microsoft/vscode', 'https://git.example.com/gitproject'].map(remote).join(' ');
		assert.deepStrictEqual(await getHashedRemotesFromConfig(config, true), await getHashedRemotesFromConfig(noDotGitConfig));
	});

	test('Cargo dependencies', () => {
		const manifest = `
[dependencies]
tokio = { version = "1", features = ["full"] }
http-client = { package = "reqwest", version = "0.12" }
serde_json.workspace = true

[dev-dependencies]
pretty_assertions = "1"

[ build-dependencies . bindgen ]
version = "0.72"

[workspace.dependencies]
azure_identity = "1"
renamed-azure . package = "azure_storage_blob"
renamed-azure . version = "1"

[target.'cfg(unix)'.dependencies]
rustls = "0.23"

[target."cfg(windows)".dependencies.windows-sys]
version = "0.60"

[package.metadata.example]
not-a-dependency = "1"
`;

		assert.deepStrictEqual(getCargoDependencyNames(manifest).sort(), [
			'azure_identity',
			'azure_storage_blob',
			'bindgen',
			'pretty_assertions',
			'reqwest',
			'rustls',
			'serde_json',
			'tokio',
			'windows-sys'
		]);
	});

	test('Cargo quoted dependency headers and target conditions containing dots', () => {
		assert.deepStrictEqual(getCargoDependencyNames(`
["dependencies"]
tokio = "1"
[workspace."dependencies"]
serde = "1"
[target.'cfg(feature = "x.dependencies.y")'.dependencies]
reqwest = "1"
[target."cfg(feature = 'x.build-dependencies.y')"."build-dependencies"."generator"]
package = "bindgen"
["dev-dependencies"."json"]
package = "serde_json"
`).sort(), ['bindgen', 'reqwest', 'serde', 'serde_json', 'tokio']);
	});

	test('Cargo aliases remain local to each dependency section', () => {
		assert.deepStrictEqual(getCargoDependencyNames(`
[dependencies]
client = { package = "reqwest", version = "1" }
[dev-dependencies]
client = "1"
[build-dependencies]
client.package = "bindgen"
client.version = "1"
[target.'cfg(unix)'.dependencies.client]
package = "rustls"
[target.'cfg(windows)'.dependencies.client]
package = "tokio"
`).sort(), ['bindgen', 'client', 'reqwest', 'rustls', 'tokio']);
	});

	test('Cargo workspace renames resolve before or after inherited declarations', () => {
		const workspaces = [`
[workspace.dependencies]
client = { package = "reqwest", version = "1" }
`, `
[workspace.dependencies.client]
package = "reqwest"
version = "1"
`, `
[workspace.dependencies]
client.package = "reqwest"
client.version = "1"
`];
		const inherited = `
[dependencies]
client = { workspace = true }
[dev-dependencies.client]
workspace = true
[build-dependencies]
client.workspace = true
`;
		for (const workspace of workspaces) {
			assert.deepStrictEqual([
				getCargoDependencyNames(workspace + inherited),
				getCargoDependencyNames(inherited + workspace)
			], [['reqwest'], ['reqwest']]);
		}
	});

	test('Cargo ignores dependency-like content in multiline strings', () => {
		for (const delimiter of ['"""', '\'\'\'']) {
			assert.deepStrictEqual(getCargoDependencyNames(`
[package]
description = ${delimiter}
# Not a TOML comment inside a string
[dependencies]
tokio = "1"
${delimiter}
[dependencies]
serde = "1"
notes = { version = "1", description = ${delimiter}
[dependencies.fake]
package = "reqwest"
${delimiter} }
actual = { package = "anyhow", version = "1" }
`).sort(), ['anyhow', 'notes', 'serde']);
		}
	});

	test('Cargo handles escaped multiline delimiters and trailing quotes', () => {
		assert.deepStrictEqual(getCargoDependencyNames(String.raw`
[package]
description = """
Escaped delimiter: \"""
[dependencies]
tokio = "1"
"""""
readme = '''
[dependencies]
reqwest = "1"
'''''
[dependencies]
serde = "1"
`), ['serde']);
	});

	test('Cargo inline dependency properties ignore quoted and nested lookalikes', () => {
		assert.deepStrictEqual(getCargoDependencyNames(`
[dependencies]
client = {
	features = [
		", package = 'tokio'", ", workspace = true"
	],
	package = "reqwest",
	version = "1"
}
serde = { features = ["derive", ", package = 'tokio'"], version = "1" }
`).sort(), ['reqwest', 'serde']);
	});

	test('Cargo pathological headers complete without backtracking', function () {
		this.timeout(1000);
		assert.deepStrictEqual(getCargoDependencyNames(`
[target.${' '.repeat(5000)}.x]
tokio = "1"
[${' '.repeat(5000)}x
reqwest = "1"
[[package.metadata.examples]]
serde = "1"
[dependencies]
anyhow = "1"
`), ['anyhow']);
	});

	function remote(url: string): string {
		return `[remote "origin"]
	url = ${url}
	fetch = +refs/heads/*:refs/remotes/origin/*
`;
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
