## Read Project Description First

The description of the project is in `Sculpt-n-Code README.md`. Read this first.

### TDD the Visualizers

When working on a *_visualizer.py file, first write failing tests in *_visulizer_tests.py. Do not TDD the typescript front-end.

### After Finishing a Feature, Have the User Check Interactions

The user should already be running `npm run watch` so any changes you make are already instantly built. Ask the user to verify that changes are working as expected and run `./scripts/code.sh $(pwd) $(pwd)/snc_test.py`, not in the background. That will boot the app in the current folder and open `./snc_test.py` automatically (you can change that file's contents as necessary to test, or open a different file). The user will test the feature and then quit the app and then report to you if the feature worked.

## Static Visual Testing (only if the user tells you to check by screenshotting)

If the change is visual and does not require mouse clicks or keyboard input to test, the user is not necessary. There is a MCP server for visual inspection called **sculpt-n-code-viewer**. Its **build_and_screenshot_app** tool will rebuild the app, launch it, and take a screenshot. You can give it a **file_path** parameter to open a particular test file to screenshot. Inspect the returned screenshot to see if changes worked.
