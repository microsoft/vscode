/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getHoistedLocations } from '../pnpmHoist.ts';
import { parsePnpmLockfile } from '../pnpmLock.ts';

suite('pnpmHoist', () => {

	test('places packages the way pnpm\'s hoisted linker does', () => {
		// - `a` and `b` need different versions of `c`: the version that more packages use is hoisted.
		// - `loader` has a peer on `webpack`, which depends on it: it moves next to `webpack`, not to the root.
		// - `webpack` and `webpack-cli` are each other's peers: they stay in the project that declares them.
		// - `optional` was skipped (`skipped` in node_modules/.modules.yaml).
		const lockfile = parsePnpmLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      a:
        specifier: 1.0.0
        version: 1.0.0
      b:
        specifier: 1.0.0
        version: 1.0.0
      d:
        specifier: 1.0.0
        version: 1.0.0
  tools:
    devDependencies:
      webpack:
        specifier: 5.0.0
        version: 5.0.0(webpack-cli@5.0.0)
      webpack-cli:
        specifier: 5.0.0
        version: 5.0.0(webpack@5.0.0)
packages:
  a@1.0.0:
    resolution: {integrity: sha512-a}
  b@1.0.0:
    resolution: {integrity: sha512-b}
  c@1.0.0:
    resolution: {integrity: sha512-c1}
  c@2.0.0:
    resolution: {integrity: sha512-c2}
  d@1.0.0:
    resolution: {integrity: sha512-d}
  loader@1.0.0:
    resolution: {integrity: sha512-loader}
    peerDependencies:
      webpack: ^5.0.0
  optional@1.0.0:
    resolution: {integrity: sha512-optional}
  webpack@5.0.0:
    resolution: {integrity: sha512-webpack}
    peerDependencies:
      webpack-cli: '*'
  webpack-cli@5.0.0:
    resolution: {integrity: sha512-webpack-cli}
    peerDependencies:
      webpack: '*'
snapshots:
  a@1.0.0:
    dependencies:
      c: 1.0.0
  b@1.0.0:
    dependencies:
      c: 2.0.0
  c@1.0.0: {}
  c@2.0.0: {}
  d@1.0.0:
    dependencies:
      c: 2.0.0
    optionalDependencies:
      optional: 1.0.0
  loader@1.0.0(webpack@5.0.0(webpack-cli@5.0.0)):
    dependencies:
      webpack: 5.0.0(webpack-cli@5.0.0)
  optional@1.0.0: {}
  webpack@5.0.0(webpack-cli@5.0.0):
    dependencies:
      loader: 1.0.0(webpack@5.0.0(webpack-cli@5.0.0))
      webpack-cli: 5.0.0(webpack@5.0.0)
  webpack-cli@5.0.0(webpack@5.0.0):
    dependencies:
      webpack: 5.0.0(webpack-cli@5.0.0)
`);

		assert.deepStrictEqual(Object.fromEntries(getHoistedLocations(lockfile, new Set(['optional@1.0.0']))), {
			'a@1.0.0': ['node_modules/a'],
			'b@1.0.0': ['node_modules/b'],
			'c@1.0.0': ['node_modules/a/node_modules/c'],
			'c@2.0.0': ['node_modules/c'],
			'd@1.0.0': ['node_modules/d'],
			'webpack@5.0.0(webpack-cli@5.0.0)': ['tools/node_modules/webpack'],
			'loader@1.0.0(webpack@5.0.0(webpack-cli@5.0.0))': ['tools/node_modules/loader'],
			'webpack-cli@5.0.0(webpack@5.0.0)': ['tools/node_modules/webpack-cli'],
		});
	});

	test('keeps a package next to the nearest ancestor that provides its peer', () => {
		// `plugin` has a peer on `peer`, provided by `host` (2.0.0) through `mid`, which doesn't
		// depend on it. The root has `peer` 1.0.0, so `plugin` can't move to the root.
		const lockfile = parsePnpmLockfile(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      host:
        specifier: 1.0.0
        version: 1.0.0
      mid:
        specifier: 0.1.0
        version: 0.1.0
      peer:
        specifier: 1.0.0
        version: 1.0.0
packages:
  host@1.0.0:
    resolution: {integrity: sha512-host}
  mid@0.1.0:
    resolution: {integrity: sha512-mid0}
  mid@1.0.0:
    resolution: {integrity: sha512-mid1}
  peer@1.0.0:
    resolution: {integrity: sha512-peer1}
  peer@2.0.0:
    resolution: {integrity: sha512-peer2}
  plugin@1.0.0:
    resolution: {integrity: sha512-plugin}
    peerDependencies:
      peer: '*'
snapshots:
  host@1.0.0:
    dependencies:
      mid: 1.0.0
      peer: 2.0.0
  mid@0.1.0: {}
  mid@1.0.0:
    dependencies:
      plugin: 1.0.0(peer@2.0.0)
  peer@1.0.0: {}
  peer@2.0.0: {}
  plugin@1.0.0(peer@2.0.0):
    dependencies:
      peer: 2.0.0
`);

		assert.deepStrictEqual(Object.fromEntries(getHoistedLocations(lockfile, new Set())), {
			'host@1.0.0': ['node_modules/host'],
			'mid@1.0.0': ['node_modules/host/node_modules/mid'],
			'plugin@1.0.0(peer@2.0.0)': ['node_modules/host/node_modules/plugin'],
			'peer@2.0.0': ['node_modules/host/node_modules/peer'],
			'mid@0.1.0': ['node_modules/mid'],
			'peer@1.0.0': ['node_modules/peer'],
		});
	});
});
