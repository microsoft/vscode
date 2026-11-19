/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as crypto from 'crypto';
import { extUri, extUriIgnorePathCase } from '../../../../../base/common/resources.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from '../../common/workspaceTags.js';
import { getCargoDependencyNames, getCargoWorkspaceDependencies, getCargoWorkspaceDependenciesForFolder, isAzureCargoDependency } from '../../common/rustWorkspaceTags.js';

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
serde_json = "1"
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

	test('Cargo dependencies in dotted paths and inline tables', () => {
		assert.deepStrictEqual([
			getCargoDependencyNames('dependencies.tokio = "1"'),
			getCargoDependencyNames('[workspace]\ndependencies.reqwest = "0.12"'),
			getCargoDependencyNames('[target.\'cfg(unix)\']\ndependencies.serde_json = "1"'),
			getCargoDependencyNames('dependencies = { reqwest = "0.12" }'),
			getCargoDependencyNames('[workspace]\ndependencies = { client = { package = "reqwest" } }'),
			getCargoDependencyNames('dependencies = { client.package = "reqwest", client.version = "0.12" }'),
			getCargoDependencyNames('[workspace]\ndependencies = { client.package = "reqwest" }')
		], [
			['tokio'],
			['reqwest'],
			['serde_json'],
			['reqwest'],
			['reqwest'],
			['reqwest'],
			['reqwest']
		]);
	});

	test('Cargo legacy dependency section names', () => {
		assert.deepStrictEqual(getCargoDependencyNames(`
[dev_dependencies]
tokio = "1"
[build_dependencies]
client = { package = "reqwest", version = "1" }
[target.'cfg(unix)'.dev_dependencies]
serde = "1"
[target.'cfg(windows)'.build_dependencies]
bindgen = "1"
`).sort(), ['bindgen', 'reqwest', 'serde', 'tokio']);
	});

	test('Cargo dependencies in inline target tables', () => {
		assert.deepStrictEqual([
			getCargoDependencyNames(`target = { 'cfg(unix)' = { dependencies = { tokio = "1" } } }`),
			getCargoDependencyNames(`[target]
'cfg(unix)' = { dependencies = { client = { package = "reqwest", version = "1" } } }`),
			getCargoDependencyNames(`[target.'cfg(unix)']
dependencies = { serde = "1" }`),
			getCargoDependencyNames(`[target]
'cfg(windows)' = {
	build-dependencies = { generator.package = "bindgen" },
	dev-dependencies = { serde_json = "1" }
}`)
		], [['tokio'], ['reqwest'], ['serde'], ['bindgen', 'serde_json']]);
	});

	test('Cargo quoted keys decode basic escapes but preserve literal keys', () => {
		const workspace = getCargoWorkspaceDependencies(String.raw`
[workspace."depend\u0065ncies"]
"cli\u0065nt" = { "pack\u0061ge" = "reqwest", version = "1" }
`);
		assert.deepStrictEqual([
			getCargoDependencyNames(String.raw`
["depend\u0065ncies"]
"to\u006bio" = "1"
'serde_json' = "1"
'literal\u006bio' = "1"
renamed."pack\u0061ge" = "anyhow"
["dev-dependencies"."oth\u0065r"]
"pack\u0061ge" = "bindgen"
`),
			getCargoDependencyNames(String.raw`
[dependencies]
"cli\u0065nt"."worksp\u0061ce" = true
`, workspace)
		], [['tokio', 'serde_json', 'literal\\u006bio', 'anyhow', 'bindgen'], ['reqwest']]);
	});

	test('Cargo array values cannot introduce dependency tables', () => {
		assert.deepStrictEqual(getCargoDependencyNames(`
[package.metadata.example]
matrix = [
	["dependencies"], # Not a table header
	[["workspace", "dependencies"]],
	[{ name = "[dev-dependencies]" }]
]
tokio = "1"
settings = {
	matrix = [
		["build-dependencies"]
	]
}
reqwest = "1"
[dependencies]
serde = { features = [
	"derive", "[dependencies]"
], version = "1" }
`), ['serde']);
	});

	test('Cargo inline workspace table defines inherited dependencies', () => {
		const contents = 'workspace = { members = ["member"], dependencies = { client.package = "reqwest", client.version = "1", serde = "1" } }';
		assert.deepStrictEqual([
			getCargoDependencyNames(contents).sort(),
			[...(getCargoWorkspaceDependencies(contents) ?? [])]
		], [
			['reqwest', 'serde'],
			[['client', 'reqwest'], ['serde', 'serde']]
		]);
	});

	test('Cargo Azure aggregate recognizes crate name prefixes', () => {
		const dependencies = getCargoDependencyNames(`
[dependencies]
identity = { package = "azure_identity", version = "1" }
functions = { package = "azure-functions", version = "1" }
not_azure = "1"
`);
		assert.deepStrictEqual(dependencies.map(name => [name, isAzureCargoDependency(name)]), [
			['azure_identity', true],
			['azure-functions', true],
			['not_azure', false]
		]);
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

	test('Cargo workspace aliases resolve across manifests without reporting unknown aliases', () => {
		const workspaceDependencies = getCargoWorkspaceDependencies(`
[workspace.dependencies]
client = { package = "reqwest", version = "0.12" }
serde_json = "1"
`);
		assert.ok(workspaceDependencies);
		const member = `
[dependencies]
client.workspace = true
serde_json.workspace = true
unknown.workspace = true
`;
		assert.deepStrictEqual([
			[...workspaceDependencies],
			getCargoDependencyNames(member),
			getCargoDependencyNames(member, workspaceDependencies)
		], [
			[['client', 'reqwest'], ['serde_json', 'serde_json']],
			[],
			['reqwest', 'serde_json']
		]);
	});

	test('Cargo member finds workspace dependencies in an ancestor manifest', async () => {
		const root = URI.file('C:\\cargo-workspace');
		const member = URI.joinPath(root, 'crates', 'member');
		const workspaceContents = `
[workspace.dependencies]
client = { package = "reqwest", version = "0.12" }
`;
		const memberContents = `
[dependencies]
client.workspace = true
`;
		const manifestContents = new Map([
			[root.path, workspaceContents],
			[member.path, memberContents]
		]);
		const foldersRead: string[] = [];
		const workspaceDependencies = await getCargoWorkspaceDependenciesForFolder(member, memberContents, [member], extUri, async folder => {
			foldersRead.push(folder.path);
			return manifestContents.get(folder.path);
		}, new Map<string, ReadonlyMap<string, string> | undefined>());
		assert.ok(workspaceDependencies);
		assert.deepStrictEqual([
			[...workspaceDependencies],
			getCargoDependencyNames(memberContents, workspaceDependencies),
			foldersRead
		], [
			[['client', 'reqwest']],
			['reqwest'],
			[member.path, URI.joinPath(root, 'crates').path, root.path]
		]);
	});

	test('Cargo explicit workspace overrides ancestor discovery', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const workspace = URI.joinPath(root, 'other');
		const contents = '[package]\nworkspace = "../other"\n[dependencies]\nclient.workspace = true';
		const files = new Map([
			[root.path, '[workspace.dependencies]\nclient = { package = "tokio", version = "1" }'],
			[workspace.path, 'workspace = { dependencies = { client = { package = "reqwest", version = "1" } } }']
		]);
		const reads: string[] = [];
		const readManifest = async (folder: URI) => {
			reads.push(folder.path);
			return files.get(folder.path);
		};
		const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
		const missing = await getCargoWorkspaceDependenciesForFolder(member, contents.replace('../other', '../missing'), [root], extUri, readManifest, new Map());
		assert.deepStrictEqual([
			getCargoDependencyNames(contents, dependencies),
			missing,
			reads
		], [
			['reqwest'],
			undefined,
			[workspace.path, URI.joinPath(root, 'missing').path]
		]);
	});

	test('Cargo explicit workspace accepts TOML string and package forms', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const workspace = URI.joinPath(root, 'other');
		const dependency = '\n[dependencies]\nclient.workspace = true';
		const forms = [
			'[package]\nworkspace = \'../other\'',
			'package.workspace = "../\\u006fther"',
			'package = { workspace = "../other" }'
		];
		const results: string[][] = [];
		const readManifest = async (folder: URI) => folder.path === workspace.path ? '[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }' : undefined;
		for (const form of forms) {
			const contents = form + dependency;
			const resolved = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
			results.push(getCargoDependencyNames(contents, resolved));
		}
		assert.deepStrictEqual(results, [['reqwest'], ['reqwest'], ['reqwest']]);
	});

	test('Cargo workspace reads stay within opened folders and their ancestors', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const reads: string[] = [];
		const readManifest = async (folder: URI) => {
			reads.push(folder.path);
			return '[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }';
		};
		const paths = ['../other', '../../outside', '/net/share', '/repo/member-other', '.', 'nested', '..'];
		const results: string[][] = [];
		for (const path of paths) {
			const contents = `[package]\nworkspace = "${path}"\n[dependencies]\nclient.workspace = true`;
			const resolved = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUri, readManifest, new Map());
			results.push(getCargoDependencyNames(contents, resolved));
		}
		assert.deepStrictEqual([results, reads], [
			[[], [], [], [], ['reqwest'], ['reqwest'], ['reqwest']],
			[member.path, URI.joinPath(member, 'nested').path, root.path]
		]);
	});

	test('Cargo workspace resolution honors provider path casing and cache identity', async () => {
		const member = URI.parse('test://host/Repo/member');
		const reads: string[] = [];
		const readManifest = async (folder: URI) => {
			reads.push(folder.path);
			return '[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }';
		};
		const cache = new Map<string, ReadonlyMap<string, string> | undefined>();
		const contents = '[package]\nworkspace = "../../repo"\n[dependencies]\nclient.workspace = true';
		const insensitive = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUriIgnorePathCase, readManifest, cache);
		const cached = await getCargoWorkspaceDependenciesForFolder(member, contents.replace('../../repo', '..'), [member], extUriIgnorePathCase, readManifest, cache);
		const sensitive = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUri, readManifest, new Map());
		const outside = await getCargoWorkspaceDependenciesForFolder(member, contents.replace('../../repo', '../../repo-other'), [member], extUriIgnorePathCase, readManifest, cache);
		const otherAuthority = await getCargoWorkspaceDependenciesForFolder(member.with({ authority: 'other' }), contents, [member], extUriIgnorePathCase, readManifest, cache);
		assert.deepStrictEqual([
			getCargoDependencyNames(contents, insensitive),
			getCargoDependencyNames(contents, cached),
			sensitive,
			outside,
			otherAuthority,
			reads
		], [
			['reqwest'],
			['reqwest'],
			undefined,
			undefined,
			undefined,
			['/repo']
		]);
	});

	(isWindows ? test : test.skip)('Cargo workspace resolution honors Windows drive-letter path casing', async () => {
		const member = URI.file('C:\\Repo\\member');
		const contents = '[package]\nworkspace = "../../repo"\n[dependencies]\nclient.workspace = true';
		const reads: string[] = [];
		const resolved = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUriIgnorePathCase, async folder => {
			reads.push(folder.path);
			return '[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }';
		}, new Map());
		assert.deepStrictEqual([getCargoDependencyNames(contents, resolved), reads], [['reqwest'], ['/C:/repo']]);
	});

	test('Cargo preserves multiline workspace paths and renamed packages', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const workspace = URI.joinPath(root, 'other');
		const paths = ['"""../other"""', '\'\'\'../other\'\'\'', '"""\n../oth\\\n  er"""', '"""../\\u006fther"""'];
		const results: string[][] = [];
		const readManifest = async (folder: URI) => folder.path === workspace.path ? String.raw`
[workspace.dependencies]
client = { package = """req\u0077est""", version = "1" }
other.package = '''serde_json'''
` : undefined;
		for (const path of paths) {
			const contents = `[package]\nworkspace = ${path}\n[dependencies]\nclient.workspace = true\nother.workspace = true\n[dev-dependencies.direct]\npackage = """\r\nany\\\r\n  how"""`;
			const resolved = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
			results.push(getCargoDependencyNames(contents, resolved));
		}
		assert.deepStrictEqual(results, Array.from({ length: paths.length }, () => ['reqwest', 'serde_json', 'anyhow']));
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
