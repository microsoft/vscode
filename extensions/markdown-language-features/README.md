# Language Features for Markdown files

**Notice:** This extension is bundled with Visual Studio Code. It can be disabled but not uninstalled.

## Features

See [Markdown in Visual Studio Code](https://code.visualstudio.com/docs/languages/markdown) to learn about the features of this extension.

### Markdown editor commit links

Commit links such as `[commit](commit:1234567)` render the commit subject and
addition/deletion counts. Opening one shows the commit's changes in the multi-diff
editor. Without a repository hint, the Git extension searches open repositories.

Use `[commit](commit:1234567?path=../../my-repo)` to select a repository relative to
the Markdown file, including repositories that are not open yet. Absolute file
URIs are also supported. URL-encode paths containing `?`, `#`, or `&`. A hinted
repository must contain the commit; an invalid hint does not fall back to another
repository. Opening a new repository requires a trusted workspace.

Forge links such as `https://github.com/owner/repo/commit/1234567?path=../repo`
also accept this hint, but the local repository's remote must match the URL.
