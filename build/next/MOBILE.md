# Isolated mobile web package

The opt-in mobile target packages the dedicated Agents entry without adding
it to the ordinary editor, Agents, desktop or server outputs.

```sh
pnpm run bundle-mobile
```

The output is `out-mobile/`, containing:

- `out/`: the mobile entry, its own localization tables, workers and resources;
- `node_modules/`: explicitly selected browser runtime dependencies;
- `extensions/`: GitHub authentication and selected language/theme extensions;
- `mobile.json`: source commit, quality, asset hashes, entry points and
  measured sizes.

The build requires a source commit. In Git worktrees, supply it through the same
environment variable used by CI:

```sh
BUILD_SOURCEVERSION="$(git rev-parse HEAD)" pnpm run bundle-mobile
```

Local packages use quality `dev`. Product builds require the normal quality
mixin to agree with `VSCODE_QUALITY`. Asset hashes describe package integrity and
local cache invalidation; they are not a separate production release identifier.
This build target alone does not publish or release anything.
The target name `mobile` identifies the package, independently of its release
quality or rollout status.

## Boundaries and size checks

[mobilePolicy.json](mobilePolicy.json) defines the reviewed
contribution list, forbidden dependencies, extensions, runtime libraries and
compressed-size limits. The build examines transitive bundle inputs, not only
the entry's direct imports. An unknown contribution or unpackaged dependency
fails the build independently of the size checks.

The ordinary entry's repository, list, Configure Session and edit presentation
implementations and clipboard registration are also rejected. The mobile entry
selects its own implementations; their shared contracts and behavior remain
available.

Mobile does not include chat-background controls, settings, rendering, tinting
or built-in background-generation tools. Its resource list is
independent of the common workbench list, so background images, including both
animated and still koi assets, are not copied into the package.

The same built-in `SKILL.md` definitions as desktop are packaged under
`out/vs/sessions/skills/`, including the background-generation skill. Mobile
uses the shared prompts service and its existing enablement rules. The
background skill already instructs the agent to explain when required tools
are unavailable rather than generating an image it cannot apply; packaging
the skill does not include the background implementation or enable its tools.

Pinned-canvas implementation is excluded from the package. The selecting entry
supplies pinning through the list presentation; shared lists do not require a
mobile placeholder service. Ordinary window canvases remain shared.

The size limits are experimental regression guards introduced with this target,
not existing VS Code product requirements or hosting restrictions. Review actual
dependency growth before changing a baseline; do not widen the contribution
list or remove a size check merely to make a build pass.

The temporary ceilings are 6,400,000 gzip bytes for the main JavaScript,
275,000 for the stylesheet, 7,000,000 for the initial bundle and 16,500,000
for the runtime. They leave headroom for normal shared-code growth above
the reviewed current-main baseline; the extension ceiling remains 800,000
gzip bytes. These are growth guards, not mobile performance targets.
Reducing the actual downloads needed for a usable session list and composer
requires separate startup measurements and loading changes.

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
node --test build/next/test/mobile.test.ts build/next/test/resources.test.ts build/next/test/bundle.test.ts
pnpm -C build run typecheck
```

On macOS, use `TMPDIR=/private/tmp` for the tests so temporary file URLs have the
same canonical path. The tests cover exact size limits and one-byte overflows,
dependency boundaries, package contents, extension resources and output safety.
Producing a package is not evidence of live authentication or real-device
behavior; those require separate end-to-end validation.

## Standard publication

The existing product pipeline selects this target by default with the
`🎯 Mobile` checkbox (`VSCODE_BUILD_WEB_MOBILE=true`). It runs in Product builds
independently of `🎯 Web`: select Mobile alone for just the mobile bundle, Web
alone for the ordinary Web bundle, or both for both bundles. Selecting neither
omits both. CI builds skip both product targets.

Web and Mobile have separate stages that reuse the same build-job template.
The existing shared Quality, APIScan, and source-security checks still run;
they are not additional product targets. The native Sanity Tests stage is
included only when a selected platform contributes tests to it. Mobile-only
and Web-only runs do not need to enable "Skip tests" to avoid an empty stage.

Mobile runs in its own optional job, with a separate timeout and workspace,
so its work cannot consume the ordinary Web job's time or prevent its archive
from being published. Mobile is best-effort: build, validation, CDN upload, archive/SBOM publication,
and artifact download/registration failures are reported without blocking the
ordinary release. Failed mobile build or CDN upload steps stop that job before
archive publication, so failed uploads cannot register a build with missing CDN assets.
Only a fully validated and archived package can be published;
failed registry operations are not recorded as successfully processed and can
be retried. Ordinary Web and other platform failures still block release.
The publisher waits for the selected stages, but a failed or canceled Mobile
stage does not override failures or successes of the required stages.
On an otherwise successful publish,
an enabled Mobile job that produces no archive emits a warning in Publish.
Canceling the whole run still stops the release.

The Mobile job creates `vscode-web-mobile.tar.gz`, with a `vscode-web-mobile/`
top-level directory, and registers its archive as platform `web-mobile` through
the normal publisher. Source commit and quality remain the release identity.
Normal release controls and platform-based update lookup select this asset;
there is no mobile-specific release registry.
The standalone Mobile job does not run the ordinary Web gulp compile; its
embedded build date therefore uses the bundler's Git commit-date fallback.

Both Web archives use the standard existing-artifact check so retrying the job
does not republish an immutable pipeline artifact.

When the usual `VSCODE_PUBLISH` flag is enabled, the existing CDN uploader places
the expanded mobile files and their own `files.txt` under
`agents/mobile/<quality>/<commit>/`. This is outside the normal editor's asset
directory, so its preload inventory does not include mobile files.

Publication contract checks run with the normal build-script tests and in the
Mobile job:

```sh
node --test build/lib/test/mobileWebPublication.test.ts
```

Local checks do not replace an unpublished Azure product build or verification
of real archive/CDN registration before enabling release automation.
