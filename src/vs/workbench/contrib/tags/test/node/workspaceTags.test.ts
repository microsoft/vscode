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

	test('Cargo only inherits from workspace dependencies', () => {
		const workspace = `
[workspace.dependencies]
shared = { package = "serde", version = "1" }
invalid.workspace = true
[workspace.dev-dependencies]
client = { package = "reqwest", version = "1" }
[workspace.build_dependencies]
generator = { package = "bindgen", version = "1" }
`;
		const member = '[dependencies]\nclient.workspace = true\ngenerator.workspace = true\ninvalid.workspace = true\nshared.workspace = true';
		const dependencies = getCargoWorkspaceDependencies(workspace);
		assert.deepStrictEqual([
			getCargoDependencyNames(workspace),
			[...(dependencies ?? [])],
			getCargoDependencyNames(member, dependencies)
		], [
			['serde'],
			[['shared', 'serde']],
			['serde']
		]);
	});

	test('Cargo member finds workspace dependencies in an ancestor manifest', async () => {
		const root = URI.parse('test:/cargo-workspace');
		const member = URI.joinPath(root, 'crates', 'member');
		const workspaceContents = `
[workspace]
members = ["crates/member"]
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
		}, new Map());
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

	test('Cargo caches manifest read failures without searching a different ancestor', async () => {
		const root = URI.parse('test:/repo');
		const nested = URI.joinPath(root, 'nested');
		const members = [URI.joinPath(nested, 'first'), URI.joinPath(nested, 'second')];
		const contents = '[dependencies]\nclient.workspace = true\ntokio = "1"';
		const reads: string[] = [];
		const readManifest = async (folder: URI): Promise<string | undefined> => {
			reads.push(folder.path);
			if (extUri.isEqual(folder, nested)) {
				throw new Error('inaccessible manifest');
			}
			return extUri.isEqual(folder, root) ? '[workspace]\nmembers = ["nested/*"]\n[workspace.dependencies]\nclient.package = "reqwest"' : contents;
		};
		const cache = new Map<string, Promise<string | undefined>>();
		const errors: string[] = [];
		for (const member of members) {
			try {
				await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, cache);
			} catch (error) {
				if (!(error instanceof Error)) {
					throw error;
				}
				errors.push(error.message);
			}
		}
		assert.deepStrictEqual([errors, reads, getCargoDependencyNames(contents)], [
			['inaccessible manifest', 'inaccessible manifest'],
			[members[0].path, nested.path, members[1].path],
			['tokio']
		]);
	});

	test('Cargo workspace discovery respects exclusions without requiring membership proof', async () => {
		const root = URI.parse('test:/repo');
		const workspace = `
[workspace]
members = [
	"crates/explicit",
	"crates/prefix*",
	"crates/special",
	"nested/include",
]
exclude = ["crates/prefix-hidden", "crates/special", "nested"]
[workspace.dependencies]
client = { package = "reqwest", version = "1" }
`;
		const contents = '[dependencies]\nclient.workspace = true';
		const paths = ['crates/explicit', 'crates/prefix-one', 'crates/prefix-hidden', 'crates/special', 'crates/unlisted', 'nested/include', 'nested/other'];
		const results: string[][] = [];
		const reads: string[][] = [];
		for (const path of paths) {
			const member = URI.joinPath(root, path);
			const foldersRead: string[] = [];
			const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUri, async folder => {
				foldersRead.push(folder.path);
				return extUri.isEqual(folder, root) ? workspace : extUri.isEqual(folder, member) ? contents : undefined;
			}, new Map());
			results.push(getCargoDependencyNames(contents, dependencies));
			reads.push(foldersRead);
		}
		assert.deepStrictEqual([
			results,
			reads.every((foldersRead, index) => foldersRead.every(path => extUri.isEqualOrParent(URI.joinPath(root, paths[index]), root.with({ path }))))
		], [
			[['reqwest'], ['reqwest'], [], ['reqwest'], ['reqwest'], ['reqwest'], []],
			true
		]);
	});

	test('Cargo excludes continue ancestor discovery but not an explicit workspace pointer', async () => {
		const root = URI.parse('test:/repo');
		const nested = URI.joinPath(root, 'nested');
		const member = URI.joinPath(nested, 'member');
		const contents = '[dependencies]\nclient.workspace = true';
		const files = new Map([
			[root.path, '[workspace]\nmembers = ["nested/member"]\n[workspace.dependencies]\nclient.package = "reqwest"'],
			[nested.path, '[workspace]\nexclude = ["member"]\n[workspace.dependencies]\nclient.package = "tokio"'],
			[member.path, contents]
		]);
		const readManifest = async (folder: URI) => files.get(folder.path);
		const found = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
		const explicitContents = `[package]\nworkspace = ".."\n${contents}`;
		const excluded = await getCargoWorkspaceDependenciesForFolder(member, explicitContents, [root], extUri, readManifest, new Map());
		assert.deepStrictEqual([getCargoDependencyNames(contents, found), excluded], [['reqwest'], undefined]);
	});

	test('Cargo workspace member arrays support dotted and inline TOML forms', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'crates', 'one');
		const contents = '[dependencies]\nclient.workspace = true';
		const workspaces = [
			'[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/two"]\n[workspace.dependencies]\nclient.package = "reqwest"',
			'workspace.members = ["crates/*"]\nworkspace.exclude = ["crates/two"]\nworkspace.dependencies.client.package = "reqwest"',
			'workspace = { members = ["crates/*"], exclude = ["crates/two"], dependencies = { client.package = "reqwest" } }'
		];
		const results: string[][] = [];
		for (const workspace of workspaces) {
			const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUri, async folder =>
				extUri.isEqual(folder, root) ? workspace : extUri.isEqual(folder, member) ? contents : undefined, new Map());
			results.push(getCargoDependencyNames(contents, dependencies));
		}
		assert.deepStrictEqual(results, [['reqwest'], ['reqwest'], ['reqwest']]);
	});

	test('Cargo workspace discovery does not read other members or path dependencies', async () => {
		const root = URI.parse('test:/repo');
		const first = URI.joinPath(root, 'crates', 'first');
		const intermediate = URI.joinPath(root, 'libs', 'intermediate');
		const member = URI.joinPath(root, 'libs', 'member');
		const contents = '[dependencies]\nclient.workspace = true';
		const files = new Map([
			[root.path, '[workspace]\nmembers = ["crates/first"]\n[workspace.dependencies]\nclient.package = "reqwest"'],
			[first.path, '[dependencies]\nnext = { path = "../../libs/intermediate" }'],
			[intermediate.path, '[build-dependencies]\nleaf.path = "../member"'],
			[member.path, contents]
		]);
		const reads: string[] = [];
		const readManifest = async (folder: URI) => {
			reads.push(folder.path);
			return files.get(folder.path);
		};
		const direct = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
		files.set(root.path, '[package]\nname = "root"\nversion = "1.0.0"\n[workspace]\n[workspace.dependencies]\nchild.path = "libs/member"\nclient.package = "reqwest"\n[dependencies]\nchild.workspace = true');
		const inherited = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
		assert.deepStrictEqual([
			getCargoDependencyNames(contents, direct),
			getCargoDependencyNames(contents, inherited),
			reads
		], [
			['reqwest'],
			['reqwest'],
			[member.path, URI.joinPath(root, 'libs').path, root.path, member.path, URI.joinPath(root, 'libs').path, root.path]
		]);
	});

	test('Cargo workspace discovery ignores costly member patterns and unrelated manifests', async function () {
		this.timeout(1000);
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'a'.repeat(48));
		const contents = '[dependencies]\nclient.workspace = true';
		const members = ['*a'.repeat(24) + 'b', ...Array.from({ length: 260 }, (_, index) => `member${index}`)];
		const workspace = `[workspace]\nmembers = ${JSON.stringify(members)}\n[workspace.dependencies]\nclient.package = "reqwest"`;
		const reads: string[] = [];
		const readManifest = async (folder: URI) => {
			reads.push(folder.path);
			if (extUri.isEqual(folder, root)) {
				return workspace;
			}
			if (extUri.isEqual(folder, member)) {
				return contents;
			}
			throw new Error('Must not inspect unrelated manifests');
		};
		const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, readManifest, new Map());
		assert.deepStrictEqual([getCargoDependencyNames(contents, dependencies), reads], [['reqwest'], [member.path, root.path]]);
	});

	test('Cargo workspace discovery needs no membership enumeration for glob path members', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const contents = '[dependencies]\nclient.workspace = true';
		const workspace = '[workspace]\nmembers = ["apps/**/service-[A-Z]*"]\n[workspace.dependencies]\nclient.package = "reqwest"';
		const reads: string[] = [];
		const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [root], extUri, async folder => {
			reads.push(folder.path);
			return extUri.isEqual(folder, root) ? workspace : extUri.isEqual(folder, member) ? contents : undefined;
		}, new Map());
		assert.deepStrictEqual([getCargoDependencyNames(contents, dependencies), reads], [['reqwest'], [member.path, root.path]]);
	});

	test('Cargo explicit workspace overrides ancestor discovery', async () => {
		const root = URI.parse('test:/repo');
		const member = URI.joinPath(root, 'member');
		const workspace = URI.joinPath(root, 'other');
		const contents = '[package]\nworkspace = "../other"\n[dependencies]\nclient.workspace = true';
		const files = new Map([
			[root.path, '[workspace.dependencies]\nclient = { package = "tokio", version = "1" }'],
			[workspace.path, 'workspace = { members = ["../member"], dependencies = { client = { package = "reqwest", version = "1" } } }']
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
		const readManifest = async (folder: URI) => folder.path === workspace.path ? '[workspace]\nmembers = ["../member"]\n[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }' : undefined;
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
			const memberPath = extUri.relativePath(folder, member) || '.';
			return `[workspace]\nmembers = [${JSON.stringify(memberPath)}]\n[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }`;
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
			return '[workspace]\nmembers = ["member"]\n[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }';
		};
		const cache = new Map<string, Promise<string | undefined>>();
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

	test('Cargo file workspace pointers tolerate case changes with glob member declarations', async () => {
		const member = URI.file(isWindows ? 'C:\\work\\Repo\\Member' : '/work/Repo/Member');
		const contents = '[package]\nworkspace = "../../repo"\n[dependencies]\nclient.workspace = true';
		const root = extUriIgnorePathCase.resolvePath(member, '../../repo');
		const results: string[][] = [];
		const reads: string[] = [];
		for (const pattern of ['*', '[A-Z]*']) {
			const dependencies = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUriIgnorePathCase, async folder => {
				reads.push(folder.path);
				return `[workspace]\nmembers = ["${pattern}"]\n[workspace.dependencies]\nclient.package = "reqwest"`;
			}, new Map());
			results.push(getCargoDependencyNames(contents, dependencies));
		}
		assert.deepStrictEqual([results, reads], [[['reqwest'], ['reqwest']], [root.path, root.path]]);
	});

	(isWindows ? test : test.skip)('Cargo workspace resolution honors Windows drive-letter path casing', async () => {
		const member = URI.file('C:\\Repo\\member');
		const contents = '[package]\nworkspace = "../../repo"\n[dependencies]\nclient.workspace = true';
		const reads: string[] = [];
		const resolved = await getCargoWorkspaceDependenciesForFolder(member, contents, [member], extUriIgnorePathCase, async folder => {
			reads.push(folder.path);
			return '[workspace]\nmembers = ["member"]\n[workspace.dependencies]\nclient = { package = "reqwest", version = "1" }';
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
[workspace]
members = ["../member"]
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
