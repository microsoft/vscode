## Project Description

The description of the project is in `Sculpt-n-Code README.md`. Read this first.

## Visual Testing

There is a MCP server for visual inspection called **sculpt-n-code-viewer**. Its **build_and_screenshot_app** tool will rebuild the app, launch it, and take a screenshot. You can give it a **file_path** parameter to open a particular test file to screenshot.

Run the tool and inspect the returned screenshot to see if changes worked.

### Having the User Check Work Instead

If, instead, the user needs to check work manually, they are already running `npm run watch` so any changes you make are already instantly built. Ask the user to verify that changes are working as expected and run `./scripts/code.sh $(pwd) $(pwd)/snc_test.py`, not in the background. That will boot the app in the current folder and open `./snc_test.py` automatically (you can change that file's contents as necessary to test, or open a different file). The user will test the feature and then quit the app, at which point you may ask the user if the feature worked.
