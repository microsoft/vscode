# theme-seti

This is an icon theme that uses the icons from [`seti-ui`](https://github.com/jesseweed/seti-ui).

## Updating icons

There is script that can be used to update icons, [./build/update-icon-theme.js](build/update-icon-theme.js).

To run this script, run `npm run update` from the `theme-seti` directory.

This can be run in one of two ways: looking at a local copy of `seti-ui` for icons, or getting them straight from GitHub.

If you want to run it from a local copy of `seti-ui`, first clone [`seti-ui`](https://github.com/jesseweed/seti-ui) to the folder next to your `vscode` repo (from the `theme-seti` directory, `../../`).
Then, inside the `set-ui` directory, run `npm install` followed by `npm run prepublishOnly`. This will generate updated icons.

If you want to download the icons straight from GitHub, change the `FROM_DISK` variable to `false` inside of `update-icon-theme.js`.

### Languages not shipped with `vscode`

Languages that are not shipped with `vscode` must be added to the `nonBuiltInLanguages` object inside of `update-icon-theme.js`.

These should match [the file mapping in `seti-ui`](https://github.com/jesseweed/seti-ui/blob/master/styles/components/icons/mapping.less).

Please try and keep this list in alphabetical order! Thank you.

## Previewing icons

There is a [`./icons/preview.html`](./icons/preview.html) file that can be opened to see all of the icons included in the theme.
Note that to view this, it needs to be hosted by a web server.

When updating icons, it is always a good idea to make sure that they work properly by looking at this page.
When submitting a PR that updates these icons, a screenshot of the preview page should accompany it.
