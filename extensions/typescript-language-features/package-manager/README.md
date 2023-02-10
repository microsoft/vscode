# Package Manager

This package is a web-compatible package manager built with tsserverlib
compatibility in mind. It does not require a "real" filesystem or a "real" NPM
installation, but instead uses [orogene](https://github.com/orogene/orogene)
to perform package management operations.

It is largely a thin wrapper around Orogene's [node-maintainer WASM
API](https://github.com/orogene/orogene/blob/abba96e6662c3465a498fbe6154ffcf2fe33fac4/crates/node-maintainer/src/wasm.rs).

## Updating vendored `node-maintainer`

Currently, this package vendors a prebuilt version of `node-maintainer` into
the `./node-maintainer` directory. This has to be manually built and updated
as needed whenever there are desired changes from orogene.

To update the directory:

1. `rm -rf ./node-maintainer`
2. clone https://github.com/orogene/orogene somewhere. See the [contributing
   instructions](https://github.com/orogene/orogene/blob/abba96e6662c3465a498fbe6154ffcf2fe33fac4/CONTRIBUTING.md#getting-up-and-running)
   for a guide on how to set up and build wasm modules.
3. `mv /path/to/orogene/crates/node-maintainer/pkg ./node-maintainer`
4. `git add node-maintainer && git commit -m 'updated node-maintainer'

## A Note on Build Requirements

To get this branch working, as of today (4/7/2023), you need to use a
TypeScript release that includes [this
commit](https://github.com/microsoft/TypeScript/commit/d23b7e7c52c471732079a9834bbfeef53b1a1697),
which has been merged into `main`, but not released yet.

In order to use an unreleased TypeScript with VS Code:

1. At the `../..` (`vscode/extensions/`) level, you should `npm link` the
   version of typescript you want.
	1. Go to your `typescript` source checkout
	2. Call `npm link`
	3. Go to `vscode/extensions`
	4. Call `npm link typescript`
