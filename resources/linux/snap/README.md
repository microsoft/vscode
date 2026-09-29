<!-- Copyright (c) Microsoft Corporation. All rights reserved. -->

# Linux Snap packages

The Linux product build packages both x64 and arm64 clients when **Linux Snap** is enabled. The client is prepared by `vscode-linux-<arch>-prepare-snap` and packed with a builder matching its architecture and Ubuntu base. An arm64 snap must contain arm64 staged libraries as well as an arm64 VS Code binary; changing only the snap's advertised architecture reproduces the crash in [#125120](https://github.com/microsoft/vscode/issues/125120).

| Base | Build environment | Availability |
| --- | --- | --- |
| `core22` | Pinned [Snapcraft 8 core22 container](https://github.com/canonical/snapcraft-rocks/tree/core22-8), Ubuntu 22.04 | Opt-in validation build with `VSCODE_SNAP_BASE=core22` and `VSCODE_PUBLISH=false` |
| `core24` | Pinned [Snapcraft 8 core24 container](https://github.com/canonical/snapcraft-rocks/tree/core24-8), Ubuntu 24.04 | Default product build |
| `core26` | Native Ubuntu 26.04 of the target architecture with Snapcraft 9 or newer | Local validation only; no verified multi-architecture Snapcraft 9/core26 container is available for CI |

The product pipeline's **Linux Snap Base** parameter selects `core22` or `core24` for both architectures. Test non-default bases without publishing: CDN assets for different bases share a platform and commit ID. The builder uses architecture-specific Azure Ubuntu mirrors before refreshing Apt. The Snap manifest selects the corresponding `architectures` (core22) or `platforms` (core24/core26), staged packages, and runtime base paths. A destructive build must use the same Ubuntu release as its snap base; relabeling a core24 snap as core26 is not a migration.

To prepare and pack a **local core26 arm64 build** on native Ubuntu 26.04 with a matching VS Code client already built:

```sh
VSCODE_SNAP_BASE=core26 npm run gulp vscode-linux-arm64-prepare-snap
VSCODE_SNAP_BASE=core26 VSCODE_ARCH=arm64 VSCODE_QUALITY=insider ./build/azure-pipelines/linux/build-snap.sh
```

Do not publish core26 builds until a reproducible multi-architecture Snapcraft 9 builder, native runtime checks, and store promotion have been validated. To check a CI-built arm64 snap on **native Ubuntu arm64** after downloading the `vscode_client_linux_arm64_snap` artifact:

```sh
sudo snap install --classic --dangerous ./code-insider-arm64-*.snap
grep -E '^(base:|architectures:| *- arm64$)' /snap/code-insiders/current/meta/snap.yaml
/snap/bin/code-insiders --version
/snap/bin/code-insiders
sudo snap remove code-insiders
```

For stable builds, install `code-stable-arm64-*.snap` and use `code` instead of `code-insiders`. In addition to startup, check the file picker, integrated and external terminals, and extension installation. CI builds and publishes the snap artifacts to the VS Code download service when publishing is enabled; promotion to the Snap Store is a separate release operation.

## Validation before a store release

On a workstation with Azure DevOps access, queue a **Product** build from a pushed branch with `VSCODE_BUILD_LINUX_SNAP=true`, `VSCODE_SNAP_BASE=core24`, `VSCODE_PUBLISH=false`, `VSCODE_RELEASE=false`, and `VSCODE_RUN_ARTIFACT_SANITY_TESTS=true`. Do not use a CI build type: it skips the product packaging jobs. The artifact sanity tests run the x64 snap but only **download** the arm64 snap; a green run does not establish that the arm64 application starts.

Download `vscode_client_linux_arm64_snap` from that build and follow the native Ubuntu arm64 install steps above. Confirm the installed snap's base and architecture, open a folder, start the integrated and external terminals, and install an extension. Repeat the install and launch checks on x64, including when testing the opt-in core22 base. Keep the results with the build so a release reviewer can verify what was exercised.

Only the authorized Snap Store publisher should upload and promote the tested artifacts, after the native arm64 checks and release approval. Confirm that **both** `code` and `code-insiders` have an `arm64` channel in the Store before treating [the ARM64 request](https://github.com/microsoft/vscode/issues/125120) as delivered. The core26 path requires its own native Ubuntu 26.04 validation and a reproducible CI builder before it can be promoted.
