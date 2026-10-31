# Isolated mobile web package

The opt-in mobile target packages the experimental Sessions entry without adding
it to the ordinary editor, Agents, desktop or server outputs.

```sh
npm run bundle-mobile-preview
```

The output is `out-mobile-preview/`, containing:

- `out/`: the mobile entry, its own localization tables, workers and resources;
- `node_modules/`: explicitly selected browser runtime dependencies;
- `extensions/`: GitHub authentication and selected language/theme extensions;
- `mobile-preview.json`: source commit, quality, asset hashes, entry points and
  measured sizes.

The build requires a source commit. In Git worktrees, supply it through the same
environment variable used by CI:

```sh
BUILD_SOURCEVERSION="$(git rev-parse HEAD)" npm run bundle-mobile-preview
```

Local packages use quality `dev`. Product builds require the normal quality
mixin to agree with `VSCODE_QUALITY`. Asset hashes describe package integrity and
local cache invalidation; they are not a separate production release identifier.
This build target alone does not publish or release anything.

## Boundaries and size checks

[mobilePreviewPolicy.json](mobilePreviewPolicy.json) defines the reviewed
contribution list, forbidden dependencies, extensions, runtime libraries and
compressed-size limits. The build examines transitive bundle inputs, not only
the entry's direct imports. An unknown contribution or unpackaged dependency
fails the build independently of the size checks.

The size limits are experimental regression guards introduced with this target,
not existing VS Code product requirements or hosting restrictions. Review actual
dependency growth before changing a baseline; do not widen the contribution
list or remove a size check merely to make a build pass.

- Initial size counts the main JavaScript, stylesheet and language bundle.
- Runtime size includes workers and runtime libraries but excludes extensions.
- Extensions have their own limit.
- Source maps, build/localization metadata and license notices are inventoried
  but excluded from these runtime totals.

These are sums of independently gzipped files, not a measured phone startup
download or memory budget.

## Output safety and validation

Only the target's owned output directory can be rebuilt. A lock prevents
concurrent builds from mixing files, and a rebuild removes the previous success
manifest before writing anything. A failed build never leaves a success manifest
for partial output.

```sh
node --test build/next/test/mobilePreview.test.ts build/next/test/resources.test.ts build/next/test/bundle.test.ts
npm --prefix build run typecheck
```

On macOS, use `TMPDIR=/private/tmp` for the tests so temporary file URLs have the
same canonical path. The tests cover exact size limits and one-byte overflows,
dependency boundaries, package contents, extension resources and output safety.
Producing a package is not evidence of live authentication or real-device
behavior; those require separate end-to-end validation.

## Standard publication

The existing product pipeline can include this target with
`VSCODE_BUILD_WEB_MOBILE=true`. The option is false by default and requires a
Product build with the ordinary Web stage enabled. When explicitly selected, a
failed mobile build, guard test or upload fails that selected build; errors are
not ignored. Ordinary builds do not run the optional mobile steps.

The Web job creates `vscode-web-mobile.tar.gz`, with a `vscode-web-mobile/`
top-level directory, and registers its archive as platform `web-mobile` through
the normal publisher. Source commit and quality remain the release identity.
Normal release controls and platform-based update lookup select this asset;
there is no mobile-specific release registry.

When the usual `VSCODE_PUBLISH` flag is enabled, the existing CDN uploader places
the expanded mobile files and their own `files.txt` under
`agents/mobile/<quality>/<commit>/`. This is outside the normal editor's asset
directory, so its preload inventory does not include mobile files.

Publication contract checks run with the normal build-script tests and in the
opted-in Web job:

```sh
node --test build/lib/test/mobileWebPublication.test.ts
```

Local checks do not replace an unpublished Azure product build or verification
of real archive/CDN registration before enabling release automation.
