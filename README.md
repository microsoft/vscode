# Personal Code - OSS Fork

This repository is a personal development and research fork of [`microsoft/vscode`](https://github.com/microsoft/vscode), the open-source **Code - OSS** codebase.

It is maintained by [`NguyenCuong1989`](https://github.com/NguyenCuong1989) and is **not** an official Microsoft repository, Visual Studio Code distribution, endorsement, or support channel.

## Provenance

- Upstream source: [`microsoft/vscode`](https://github.com/microsoft/vscode)
- Upstream project: **Code - OSS**
- Upstream license: [MIT](LICENSE.txt)
- Third-party notices: [ThirdPartyNotices.txt](ThirdPartyNotices.txt)
- Fork-specific attribution and redistribution notes: [FORK_NOTICE.md](FORK_NOTICE.md)

The Microsoft copyright notice and upstream MIT license are intentionally preserved. Third-party notices inherited from upstream are also preserved.

## Fork scope

The fork-specific changes are intentionally kept separate from the upstream project. They currently focus on personal development automation, Codespaces/Git identity setup, repository guardrails, and provenance documentation rather than replacing the upstream core license or claiming ownership of Code - OSS.

For the exact changes relative to the upstream base used by this fork, use Git history/compare views. Any future third-party code or dependency added specifically by this fork should carry the attribution and license material required by that component.

## Upstream documentation and support

For official Code - OSS development documentation, contribution guidance, issues, roadmap, and build instructions, use the upstream project:

- Repository: https://github.com/microsoft/vscode
- Contributing: https://github.com/microsoft/vscode/wiki/How-to-Contribute
- Issues: https://github.com/microsoft/vscode/issues
- Visual Studio Code product site: https://code.visualstudio.com/

Links to Microsoft or Visual Studio Code are descriptive references to the upstream project/product. They do not imply affiliation.

## Branding and redistribution

`Code - OSS` source and Microsoft's separately distributed **Visual Studio Code** product are not the same distribution. An independently published binary should use distinct branding and should be reviewed for product names, logos/icons, marketplace/service integrations, bundled extensions, and third-party license obligations before release.

No release binaries are published from this repository at the time of this notice.

## Development container

This fork inherits the upstream Dev Container / Codespaces setup. The fork also contains local Git-identity normalization and verification logic under `.devcontainer/` and `.github/workflows/codespaces-git-identity.yml`.

## License

Upstream Code - OSS source:

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT License](LICENSE.txt).

Fork-specific changes do not remove or supersede upstream or third-party license obligations. See [FORK_NOTICE.md](FORK_NOTICE.md).
