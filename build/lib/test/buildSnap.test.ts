/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { copyrightFilter } from '../../filters.ts';
import { getSnapBase, getSnapcraftConfig } from '../../linux/snapcraftConfig.ts';

const buildScript = path.resolve(import.meta.dirname, '../../azure-pipelines/linux/build-snap.sh');
const launcherScript = path.resolve(import.meta.dirname, '../../../resources/linux/snap/electron-launch');
const snapcraftTemplate = path.resolve(import.meta.dirname, '../../../resources/linux/snap/snapcraft.yaml');
const compileTemplate = path.resolve(import.meta.dirname, '../../azure-pipelines/linux/steps/product-build-linux-compile.yml');

suite('Linux Snap packaging', { skip: process.platform !== 'linux' }, () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-snap-'));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function prepareSource(arch: string, base = 'core24'): string {
		const source = path.join(root, '.build', 'linux', 'snap', arch, `code-${arch}`);
		fs.mkdirSync(path.join(source, 'snap'), { recursive: true });
		fs.mkdirSync(path.join(source, 'usr', 'share', 'code'), { recursive: true });
		fs.writeFileSync(path.join(source, 'snap', 'snapcraft.yaml'), `name: code\nbase: ${base}\n`);
		fs.writeFileSync(path.join(source, 'usr', 'share', 'code', 'code'), 'binary');
		return source;
	}

	function installMocks(): string {
		const bin = path.join(root, 'bin');
		fs.mkdirSync(bin);
		fs.writeFileSync(path.join(bin, 'file'), '#!/bin/sh\nprintf "%s\\n" "$TEST_BINARY_INFO"\n', { mode: 0o755 });
		fs.writeFileSync(path.join(bin, 'sudo'), `#!/bin/sh
set -eu
printf '%s\\n' "$@" > "$TEST_DOCKER_ARGS"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    shift
    output=$1
  fi
  shift
done
printf snap > "$TEST_SNAP_SOURCE/\${output##*/}"
echo "Packed snap"
`, { mode: 0o755 });
		return bin;
	}

	test('rejects unsupported architectures before packaging', () => {
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, VSCODE_ARCH: 'armhf', VSCODE_QUALITY: 'insider' }
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, 'Unsupported Snap architecture: armhf']);
	});

	test('ignores previously built snaps when locating the prepared source', () => {
		const source = prepareSource('arm64');
		fs.writeFileSync(path.join(path.dirname(source), 'code-insider-arm64-123.snap'), 'previous snap');
		const bin = installMocks();
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				VSCODE_ARCH: 'arm64',
				VSCODE_QUALITY: 'insider',
				TEST_BINARY_INFO: 'ELF 64-bit LSB executable, ARM aarch64',
				TEST_DOCKER_ARGS: path.join(root, 'docker-args'),
				TEST_SNAP_SOURCE: source
			}
		});

		assert.strictEqual(result.status, 0, result.stderr);
	});

	test('rejects a mislabeled arm64 executable', () => {
		const source = prepareSource('arm64');
		const bin = installMocks();
		const argsFile = path.join(root, 'docker-args');
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				VSCODE_ARCH: 'arm64',
				VSCODE_QUALITY: 'insider',
				TEST_BINARY_INFO: 'ELF 64-bit LSB executable, x86-64',
				TEST_DOCKER_ARGS: argsFile,
				TEST_SNAP_SOURCE: source
			}
		});

		assert.deepStrictEqual([result.status, result.stderr.trim(), fs.existsSync(argsFile)], [
			1,
			'The prepared code executable is not aarch64: ELF 64-bit LSB executable, x86-64',
			false
		]);
	});

	test('rejects a base that does not match the requested base', () => {
		const source = prepareSource('arm64');
		fs.writeFileSync(path.join(source, 'snap', 'snapcraft.yaml'), 'name: code\nbase: core22\n');
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, VSCODE_ARCH: 'arm64', VSCODE_QUALITY: 'insider', VSCODE_SNAP_BASE: 'core24' }
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, 'The prepared Snap uses core22, but VSCODE_SNAP_BASE is core24.']);
	});

	test('rejects unsupported bases in the prepared manifest', () => {
		const source = prepareSource('arm64');
		fs.writeFileSync(path.join(source, 'snap', 'snapcraft.yaml'), 'name: code\nbase: core20\n');
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, VSCODE_ARCH: 'arm64', VSCODE_QUALITY: 'insider' }
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, 'Unsupported Snap base in the prepared package: core20']);
	});

	for (const base of ['core22', 'core24', 'core26']) {
		for (const [arch, multiarch] of [['amd64', 'x86_64-linux-gnu'], ['arm64', 'aarch64-linux-gnu']]) {
			test(`starts a ${base} ${arch} snap through the desktop launcher`, () => {
				const snap = path.join(root, 'snap');
				const data = path.join(root, 'data');
				const common = path.join(root, 'common');
				const runtime = path.join(root, 'runtime');
				for (const dir of [path.join(snap, 'meta'), data, common, runtime]) {
					fs.mkdirSync(dir, { recursive: true });
				}
				fs.writeFileSync(path.join(snap, 'meta', 'snap.yaml'), `name: code\nbase: ${base}\n`);
				fs.writeFileSync(path.join(data, '.last_revision'), 'SNAP_DESKTOP_LAST_REVISION=test\n');
				const entryPoint = path.join(root, 'entrypoint');
				fs.writeFileSync(entryPoint, '#!/bin/sh\nprintf "%s\\n" "$SNAP_LAUNCHER_ARCH_TRIPLET" "$1"\n', { mode: 0o755 });

				const result = spawnSync('bash', [launcherScript, entryPoint], {
					encoding: 'utf8',
					env: {
						...process.env,
						SNAP: snap,
						SNAP_USER_DATA: data,
						SNAP_USER_COMMON: common,
						SNAP_VERSION: 'test',
						SNAP_ARCH: arch,
						XDG_RUNTIME_DIR: runtime,
					}
				});

				assert.deepStrictEqual([result.status, result.stdout.trim()], [0, `${multiarch}\n--ozone-platform=x11`]);
			});
		}
	}

	test('rejects unrecognized snap bases in the launcher', () => {
		const snap = path.join(root, 'snap');
		fs.mkdirSync(path.join(snap, 'meta'), { recursive: true });
		fs.writeFileSync(path.join(snap, 'meta', 'snap.yaml'), 'base: core20\n');
		const result = spawnSync('bash', [launcherScript], {
			encoding: 'utf8',
			env: { ...process.env, SNAP: snap }
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, 'Unsupported VS Code snap base: core20']);
	});

	test('reports missing installed snap metadata', () => {
		const snap = path.join(root, 'snap');
		const result = spawnSync('bash', [launcherScript], {
			encoding: 'utf8',
			env: { ...process.env, SNAP: snap }
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, `Cannot read VS Code snap metadata: ${snap}/meta/snap.yaml`]);
	});

	test('uses core24 by default and rejects unsupported build bases', () => {
		assert.strictEqual(getSnapBase(undefined), 'core24');
		assert.throws(() => getSnapBase('core20'), /Unsupported Snap base: core20/);
		assert.throws(() => getSnapcraftConfig('riscv64', 'core24'), /Unsupported Snap architecture: riscv64/);
	});

	test('pins the privileged ARM64 emulation image', () => {
		const template = fs.readFileSync(compileTemplate, 'utf8');
		assert.deepStrictEqual({
			pinned: template.includes('vscodehub.azurecr.io/multiarch/qemu-user-static@sha256:fe60359c92e86a43cc87b3d906006245f77bfc0565676b80004cc666e4feb9f0'),
			mutableTag: template.includes('qemu-user-static:latest')
		}, { pinned: true, mutableTag: false });
	});

	test('excludes Apt sources from the TypeScript copyright header check', () => {
		assert.deepStrictEqual([
			'!build/azure-pipelines/linux/snapcraft-apt-retries.conf',
			'!build/azure-pipelines/linux/snapcraft-ubuntu-*.list',
			'!build/azure-pipelines/linux/snapcraft-ubuntu-*.sources'
		].filter(pattern => !copyrightFilter.includes(pattern)), []);
	});

	test('prevents publishing and releasing core22 product builds', () => {
		const root = fs.readFileSync(path.resolve(import.meta.dirname, '../../azure-pipelines/product-build.yml'), 'utf8');
		const sharedVariables = fs.readFileSync(path.resolve(import.meta.dirname, '../../azure-pipelines/product-build-variables.yml'), 'utf8');
		const template = fs.readFileSync(path.resolve(import.meta.dirname, '../../azure-pipelines/product-build-template.yml'), 'utf8');
		const gate = "or(eq(parameters.VSCODE_BUILD_LINUX_SNAP, false), eq(parameters.VSCODE_SNAP_BASE, 'core24'))";

		assert.deepStrictEqual({
			productPublish: root.includes(`value: \${{ and(eq(parameters.VSCODE_PUBLISH, true), eq(variables.VSCODE_CIBUILD, false), ${gate}) }}`),
			sharedPublish: sharedVariables.includes(`value: \${{ and(eq(parameters.VSCODE_PUBLISH, true), eq(variables.VSCODE_CIBUILD, false), ${gate}) }}`),
			rejectProductPublish: root.includes('Core22 Snap builds require VSCODE_PUBLISH=false and VSCODE_RELEASE=false.'),
			rejectTemplatePublish: template.includes('Core22 Snap builds require VSCODE_PUBLISH=false and VSCODE_RELEASE=false.'),
			templatePublish: template.includes(`if and(eq(variables['VSCODE_PUBLISH'], true), ${gate})`),
			templateRelease: template.includes(`if and(parameters.VSCODE_RELEASE, eq(variables.VSCODE_PUBLISH, true), ${gate}`)
		}, {
			productPublish: true,
			sharedPublish: true,
			rejectProductPublish: true,
			rejectTemplatePublish: true,
			templatePublish: true,
			templateRelease: true
		});
	});

	test('selects staged desktop libraries for each Ubuntu base', () => {
		const packages = (base: 'core22' | 'core24' | 'core26') => {
			const { asound, atkBridge, atk, atspi, curl, glib, gtk } = getSnapcraftConfig('arm64', base);
			return [asound, atkBridge, atk, atspi, curl, glib, gtk];
		};
		const t64Packages = ['libasound2t64', 'libatk-bridge2.0-0t64', 'libatk1.0-0t64', 'libatspi2.0-0t64', 'libcurl4t64', 'libglib2.0-0t64', 'libgtk-3-0t64'];

		assert.deepStrictEqual({
			core22: packages('core22'),
			core24: packages('core24'),
			core26: packages('core26')
		}, {
			core22: ['libasound2', 'libatk-bridge2.0-0', 'libatk1.0-0', 'libatspi2.0-0', 'libcurl4', 'libglib2.0-0', 'libgtk-3-0'],
			core24: t64Packages,
			core26: t64Packages
		});
	});

	test('replaces every Snapcraft template token during preparation', () => {
		const gulpfile = fs.readFileSync(path.resolve(import.meta.dirname, '../../gulpfile.vscode.linux.ts'), 'utf8');
		const tokens = new Set(fs.readFileSync(snapcraftTemplate, 'utf8').match(/@@[A-Z_]+@@/g));
		assert.deepStrictEqual([...tokens].filter(token => !gulpfile.includes(`replace('${token}'`)), []);
	});

	test('requires native Ubuntu 26.04 and matching architecture for core26', () => {
		const source = prepareSource('arm64', 'core26');
		const bin = installMocks();
		fs.writeFileSync(path.join(bin, 'dpkg'), '#!/bin/sh\nprintf "amd64\\n"\n', { mode: 0o755 });
		const result = spawnSync('bash', [buildScript], {
			cwd: root,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				VSCODE_ARCH: 'arm64',
				VSCODE_QUALITY: 'insider',
				VSCODE_SNAP_BASE: 'core26',
				TEST_BINARY_INFO: 'ELF 64-bit LSB executable, ARM aarch64',
				TEST_DOCKER_ARGS: path.join(root, 'docker-args'),
				TEST_SNAP_SOURCE: source
			}
		});

		assert.deepStrictEqual([result.status, result.stderr.trim()], [1, 'core26 Snap builds require native Ubuntu 26.04 on arm64.']);
	});

	for (const base of ['core22', 'core24', 'core26']) {
		for (const [arch, snapArch] of [['x64', 'amd64'], ['arm64', 'arm64']]) {
			test(`generates a ${base} manifest for ${snapArch}`, () => {
				const config = getSnapcraftConfig(arch, getSnapBase(base));
				const template = fs.readFileSync(snapcraftTemplate, 'utf8');
				const replacements = {
					'@@NAME@@': 'code',
					'@@VERSION@@': '12345678',
					'@@ARCHITECTURES@@': config.architectures,
					'@@SNAP_BASE@@': config.base,
					'@@MULTIARCH@@': config.multiarch,
					'@@LIBASOUND@@': config.asound,
					'@@LIBATK_BRIDGE@@': config.atkBridge,
					'@@LIBATK@@': config.atk,
					'@@LIBATSPI@@': config.atspi,
					'@@LIBCURL@@': config.curl,
					'@@LIBGLIB@@': config.glib,
					'@@LIBGTK@@': config.gtk,
				};
				const manifest = Object.entries(replacements).reduce((text, [token, value]) => text.replaceAll(token, value), template);

				assert.deepStrictEqual({
					base: config.base,
					architecture: manifest.match(/^(?:architectures:\n  - \w+|platforms:\n  \w+:\n    build-on: \[\w+\]\n    build-for: \[\w+\])/m)?.[0],
					unresolvedTokens: manifest.match(/@@[A-Z_]+@@/g),
					packages: [config.asound, config.atkBridge, config.atk, config.atspi, config.curl, config.glib, config.gtk]
						.every(pkg => manifest.includes(`      - ${pkg}\n`)),
					rpath: manifest.includes(`/snap/${base}/current/lib/${config.multiarch}`),
				}, {
					base,
					architecture: base === 'core22'
						? `architectures:\n  - ${snapArch}`
						: `platforms:\n  ${snapArch}:\n    build-on: [${snapArch}]\n    build-for: [${snapArch}]`,
					unresolvedTokens: null,
					packages: true,
					rpath: true,
				});
			});
		}
	}

	for (const [base, release, sourceExtension, target] of [
		['core22', '22', 'list', '/etc/apt/sources.list'],
		['core24', '24', 'sources', '/etc/apt/sources.list.d/ubuntu.sources']
	]) {
		for (const [arch, snapArch, binaryInfo] of [
			['x64', 'amd64', 'ELF 64-bit LSB executable, x86-64'],
			['arm64', 'arm64', 'ELF 64-bit LSB executable, ARM aarch64']
		]) {
			test(`uses the Ubuntu ${release}.04 ${snapArch} package mirror and security updates`, () => {
				const sources = fs.readFileSync(path.resolve(import.meta.dirname, `../../azure-pipelines/linux/snapcraft-ubuntu-${release}-${snapArch}.${sourceExtension}`), 'utf8');
				const mirror = snapArch === 'arm64' ? 'http://azure.ports.ubuntu.com/ubuntu-ports' : 'http://azure.archive.ubuntu.com/ubuntu';
				const securityMirror = snapArch === 'arm64' ? mirror : 'http://security.ubuntu.com/ubuntu';

				if (base === 'core22') {
					assert.deepStrictEqual(sources.split('\n').filter(line => line.startsWith('deb ')), [
						`deb ${mirror} jammy main restricted universe multiverse`,
						`deb ${mirror} jammy-updates main restricted universe multiverse`,
						`deb ${mirror} jammy-backports main restricted universe multiverse`,
						`deb ${securityMirror} jammy-security main restricted universe multiverse`
					]);
				} else {
					assert.deepStrictEqual(sources.split('\n').filter(line => /^(?:Types|URIs|Suites|Components|Signed-By): /.test(line)), [
						'Types: deb',
						`URIs: ${mirror}`,
						'Suites: noble noble-updates noble-backports',
						'Components: main universe restricted multiverse',
						'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg',
						'Types: deb',
						`URIs: ${securityMirror}`,
						'Suites: noble-security',
						'Components: main universe restricted multiverse',
						'Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg'
					]);
				}
			});

			test(`packs ${base} ${arch} with the matching platform and Apt sources`, () => {
				const source = prepareSource(arch, base);
				const bin = installMocks();
				const argsFile = path.join(root, 'docker-args');
				const result = spawnSync('bash', [buildScript], {
					cwd: root,
					encoding: 'utf8',
					env: {
						...process.env,
						PATH: `${bin}:${process.env.PATH}`,
						VSCODE_ARCH: arch,
						VSCODE_QUALITY: 'insider',
						VSCODE_SNAP_BASE: base,
						TEST_BINARY_INFO: binaryInfo,
						TEST_DOCKER_ARGS: argsFile,
						TEST_SNAP_SOURCE: source
					}
				});

				assert.strictEqual(result.status, 0, result.stderr);
				const args = fs.readFileSync(argsFile, 'utf8');
				const imageDigest = base === 'core22'
					? 'f664b5db4deeea6847a341e1a47627b7b9a245a0de4ca7f8f061f3b2bc9b4d5a'
					: '0443273552768a3230c2ede3aa47e567da0242bfbb0a7bb1283093208c404a0c';
				assert.deepStrictEqual({
					platform: args.includes(`--platform\nlinux/${snapArch}\n`),
					aptSources: args.includes(`snapcraft-ubuntu-${release}-${snapArch}.${sourceExtension},dst=${target},readonly`),
					builder: args.includes(`ghcr.io/canonical/snapcraft:8_${base}@sha256:${imageDigest}`),
					crossBuild: args.includes('--target-arch')
				}, { platform: true, aptSources: true, builder: true, crossBuild: false });
				assert.match(args, /--destructive-mode\n--output\n\/project\/code-insider-/);
				const files = fs.readdirSync(path.dirname(source)).filter(file => file.endsWith('.snap'));
				assert.deepStrictEqual(files.map(file => file.replace(/-\d+\.snap$/, '')), [`code-insider-${arch}`]);
			});
		}
	}
});
