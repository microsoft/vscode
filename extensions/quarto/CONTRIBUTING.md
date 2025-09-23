# Building the extension

To develop the Quarto VS Code extension, clone the quarto mono-repo, run `yarn` at top level, then run the `yarn dev-vscode` command:

```sh
yarn             # install dependencies
yarn dev-vscode  # run development/debug version of extension
```

Run the extension tests with:

```sh
yarn test-vscode # compile the test files and run them with the vscode-test CLI
```

Install the dev version of the extension in VS Code or Positron with:

```sh
yarn install-vscode
yarn install-positron
```

# Debugging the extension

The extension must have been built in dev mode (see the build section). The `dev` build flag is essential for debugging:

- It disables minifying and generates source maps from generated JS files to source TS files. The source maps allow you to set breakpoints in our TS files and step through them.

- It causes the LSP node process to be spawned in debug mode. This allows VS Code or another debugger to connect to the LSP via a special port.

Here is the process:

- Let `yarn dev-vscode` run in the background somewhere.

- Open the `apps/vscode` folder in VS Code or Positron and go to the `Run and debug` pane.

- Run the `Run VS Code Extension` to open the dev version of the extension in a new window.

- If you need to set breakpoints in the LSP, you'll have to select the launch configuration `Attach to VS Code LSP server` and run that as well. You should see your LSP breakpoints bind (go from grayed out to red dots) as soon as the debugger is attached to the LSP.

  Note that if you close the dev window and stop the extension debugging session, you'll have to manually close the LSP debugging session.

# Releasing and Publishing

You can find [the releases of this repository here](https://github.com/quarto-dev/quarto/releases).

The VSCode extension is published on the [Microsoft Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=quarto.quarto) as well as the [Open VSX Registry](https://open-vsx.org/extension/quarto/quarto).

Here are the steps for making a release and publishing:

1. Note the version in `apps/vscode/package.json`.
2. Check that the topmost version in `apps/vscode/CHANGELOG.md` matches the version you saw in `apps/vscode/package.json`. Next to that version number, it should say "(Unreleased)". Replace "(Unreleased)" with "(Release on YYYY-MM-DD)" with the current date filled in. Please also ensure that the changelog includes descriptions of all the changes in the release. [example PR](https://github.com/quarto-dev/quarto/pull/794/files).
3. Open the ["Publish VSCode Extension to Marketplaces" workflow page](https://github.com/quarto-dev/quarto/actions/workflows/publish.yaml) and run the workflow, after checking the box to confirm that the version and changelog are up-to-date. [example workflow run](https://github.com/quarto-dev/quarto/actions/runs/17108094709/job/48522198389).
4. If the action was successful, then it will have published the extension to both marketplaces and also created a new release. Navigate to the [releases page](https://github.com/quarto-dev/quarto/releases) and edit the description of your release to contain the same bullet points as the changelog for that version.
5. To prepare for next release, please now bump the minor version in `apps/vscode/package.json` and add a new heading in `apps/vscode/CHANGELOG.md` with that bumped version number next to "(Unreleased)". [example PR](https://github.com/quarto-dev/quarto/pull/795/files).

The circle of life, er, I mean, releasing and publishing is now complete.

## Troubleshooting Releasing and Publishing

### The "Publish VSCode Extension to Marketplaces" workflow failed
Check the logs of the action run. If publishing to Visual Studio Marketplace failed, it is likely because the key for this marketplace and the key has expired. [Julia](https://github.com/juliasilge) owns this key. Please message her in this case.
