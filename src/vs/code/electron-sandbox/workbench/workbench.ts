/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-restricted-globals */

(function () {

	type INativeWindowConfiguration = import('vs/platform/window/common/window.ts').INativeWindowConfiguration;
	type NativeParsedArgs = import('vs/platform/environment/common/argv.js').NativeParsedArgs;
	type IBootstrapWindow = import('vs/platform/window/electron-sandbox/window.js').IBootstrapWindow;
	type IMainWindowSandboxGlobals = import('vs/base/parts/sandbox/electron-sandbox/globals.js').IMainWindowSandboxGlobals;

	const bootstrapWindow: IBootstrapWindow = (window as any).MonacoBootstrapWindow; 	// defined by bootstrap-window.ts
	const preloadGlobals: IMainWindowSandboxGlobals = (window as any).vscode; 			// defined by preload.ts

	// Add a perf entry right from the top
	performance.mark('code/didStartRenderer');

	// Load workbench main JS and CSS all in parallel. This is an
	// optimization to prevent a waterfall of loading to happen, because
	// we know for a fact that workbench.desktop.main will depend on
	// the related CSS counterpart.
	bootstrapWindow.load<INativeWindowConfiguration>('vs/workbench/workbench.desktop.main',
		function (desktopMain, configuration) {

			// Mark start of workbench
			performance.mark('code/didLoadWorkbenchMain');

			return desktopMain.main(configuration);
		},
		{
			configureDeveloperSettings: function (windowConfig) {
				return {
					// disable automated devtools opening on error when running extension tests
					// as this can lead to nondeterministic test execution (devtools steals focus)
					forceDisableShowDevtoolsOnError: typeof windowConfig.extensionTestsPath === 'string' || windowConfig['enable-smoke-test-driver'] === true,
					// enable devtools keybindings in extension development window
					forceEnableDeveloperKeybindings: Array.isArray(windowConfig.extensionDevelopmentPath) && windowConfig.extensionDevelopmentPath.length > 0,
					removeDeveloperKeybindingsAfterLoad: true
				};
			},
			canModifyDOM: function (windowConfig) {
				showSplash(windowConfig);
			},
			beforeImport: function (windowConfig) {
				performance.mark('code/willLoadWorkbenchMain');

				// Code windows have a `vscodeWindowId` property to identify them
				Object.defineProperty(window, 'vscodeWindowId', {
					get: () => windowConfig.windowId
				});

				// It looks like browsers only lazily enable
				// the <canvas> element when needed. Since we
				// leverage canvas elements in our code in many
				// locations, we try to help the browser to
				// initialize canvas when it is idle, right
				// before we wait for the scripts to be loaded.
				window.requestIdleCallback(() => {
					const canvas = document.createElement('canvas');
					const context = canvas.getContext('2d');
					context?.clearRect(0, 0, canvas.width, canvas.height);
					canvas.remove();
				}, { timeout: 50 });
			}
		}
	);

	//#region Helpers

	function showSplash(configuration: INativeWindowConfiguration & NativeParsedArgs) {
		performance.mark('code/willShowPartsSplash');

		let data = configuration.partsSplash;

		if (data) {
			// high contrast mode has been turned by the OS -> ignore stored colors and layouts
			if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
				if ((configuration.colorScheme.dark && data.baseTheme !== 'hc-black') || (!configuration.colorScheme.dark && data.baseTheme !== 'hc-light')) {
					data = undefined;
				}
			} else if (configuration.autoDetectColorScheme) {
				// OS color scheme is tracked and has changed
				if ((configuration.colorScheme.dark && data.baseTheme !== 'vs-dark') || (!configuration.colorScheme.dark && data.baseTheme !== 'vs')) {
					data = undefined;
				}
			}
		}

		// developing an extension -> ignore stored layouts
		if (data && configuration.extensionDevelopmentPath) {
			data.layoutInfo = undefined;
		}

		// minimal color configuration (works with or without persisted data)
		let baseTheme;
		let shellBackground;
		let shellForeground;
		if (data) {
			baseTheme = data.baseTheme;
			shellBackground = data.colorInfo.editorBackground;
			shellForeground = data.colorInfo.foreground;
		} else if (configuration.autoDetectHighContrast && configuration.colorScheme.highContrast) {
			if (configuration.colorScheme.dark) {
				baseTheme = 'hc-black';
				shellBackground = '#000000';
				shellForeground = '#FFFFFF';
			} else {
				baseTheme = 'hc-light';
				shellBackground = '#FFFFFF';
				shellForeground = '#000000';
			}
		} else if (configuration.autoDetectColorScheme) {
			if (configuration.colorScheme.dark) {
				baseTheme = 'vs-dark';
				shellBackground = '#1E1E1E';
				shellForeground = '#CCCCCC';
			} else {
				baseTheme = 'vs';
				shellBackground = '#FFFFFF';
				shellForeground = '#000000';
			}
		}

		const style = document.createElement('style');
		style.className = 'initialShellColors';
		window.document.head.appendChild(style);
		style.textContent = `body {
				background-color: ${shellBackground};
				color: ${shellForeground};
				margin: 0;
				padding: 0;
			}`;

		// set zoom level as soon as possible
		if (typeof data?.zoomLevel === 'number' && typeof preloadGlobals?.webFrame?.setZoomLevel === 'function') {
			preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
		}

		// restore parts if possible (we might not always store layout info)
		if (data?.layoutInfo) {
			const { layoutInfo, colorInfo } = data;

			const splash = document.createElement('div');
			splash.id = 'monaco-parts-splash';
			splash.className = baseTheme ?? 'vs-dark';

			if (layoutInfo.windowBorder && colorInfo.windowBorder) {
				splash.setAttribute('style', `
						position: relative;
						height: calc(100vh - 2px);
						width: calc(100vw - 2px);
						border: 1px solid var(--window-border-color);
					`);
				splash.style.setProperty('--window-border-color', colorInfo.windowBorder);

				if (layoutInfo.windowBorderRadius) {
					splash.style.borderRadius = layoutInfo.windowBorderRadius;
				}
			}

			// ensure there is enough space
			layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth));

			// part: title
			const titleDiv = document.createElement('div');
			titleDiv.setAttribute('style', `
					position: absolute;
					width: 100%;
					height: ${layoutInfo.titleBarHeight}px;
					left: 0;
					top: 0;
					background-color: ${colorInfo.titleBarBackground};
					-webkit-app-region: drag;
				`);
			splash.appendChild(titleDiv);

			if (colorInfo.titleBarBorder && layoutInfo.titleBarHeight > 0) {
				const titleBorder = document.createElement('div');
				titleBorder.setAttribute('style', `
						position: absolute;
						width: 100%;
						height: 1px;
						left: 0;
						bottom: 0;
						border-bottom: 1px solid ${colorInfo.titleBarBorder};
					`);
				titleDiv.appendChild(titleBorder);
			}

			// part: activity bar
			const activityDiv = document.createElement('div');
			activityDiv.setAttribute('style', `
					position: absolute;
					width: ${layoutInfo.activityBarWidth}px;
					height: calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px);
					top: ${layoutInfo.titleBarHeight}px;
					${layoutInfo.sideBarSide}: 0;
					background-color: ${colorInfo.activityBarBackground};
				`);
			splash.appendChild(activityDiv);

			if (colorInfo.activityBarBorder && layoutInfo.activityBarWidth > 0) {
				const activityBorderDiv = document.createElement('div');
				activityBorderDiv.setAttribute('style', `
						position: absolute;
						width: 1px;
						height: 100%;
						top: 0;
						${layoutInfo.sideBarSide === 'left' ? 'right' : 'left'}: 0;
						${layoutInfo.sideBarSide === 'left' ? 'border-right' : 'border-left'}: 1px solid ${colorInfo.activityBarBorder};
					`);
				activityDiv.appendChild(activityBorderDiv);
			}

			// part: side bar (only when opening workspace/folder)
			// folder or workspace -> status bar color, sidebar
			if (configuration.workspace) {
				const sideDiv = document.createElement('div');
				sideDiv.setAttribute('style', `
						position: absolute;
						width: ${layoutInfo.sideBarWidth}px;
						height: calc(100% - ${layoutInfo.titleBarHeight + layoutInfo.statusBarHeight}px);
						top: ${layoutInfo.titleBarHeight}px;
						${layoutInfo.sideBarSide}: ${layoutInfo.activityBarWidth}px;
						background-color: ${colorInfo.sideBarBackground};
					`);
				splash.appendChild(sideDiv);

				if (colorInfo.sideBarBorder && layoutInfo.sideBarWidth > 0) {
					const sideBorderDiv = document.createElement('div');
					sideBorderDiv.setAttribute('style', `
							position: absolute;
							width: 1px;
							height: 100%;
							top: 0;
							right: 0;
							${layoutInfo.sideBarSide === 'left' ? 'right' : 'left'}: 0;
							${layoutInfo.sideBarSide === 'left' ? 'border-right' : 'border-left'}: 1px solid ${colorInfo.sideBarBorder};
						`);
					sideDiv.appendChild(sideBorderDiv);
				}
			}

			// part: statusbar
			const statusDiv = document.createElement('div');
			statusDiv.setAttribute('style', `
					position: absolute;
					width: 100%;
					height: ${layoutInfo.statusBarHeight}px;
					bottom: 0;
					left: 0;
					background-color: ${configuration.workspace ? colorInfo.statusBarBackground : colorInfo.statusBarNoFolderBackground};
				`);
			splash.appendChild(statusDiv);

			if (colorInfo.statusBarBorder && layoutInfo.statusBarHeight > 0) {
				const statusBorderDiv = document.createElement('div');
				statusBorderDiv.setAttribute('style', `
						position: absolute;
						width: 100%;
						height: 1px;
						top: 0;
						border-top: 1px solid ${colorInfo.statusBarBorder};
					`);
				statusDiv.appendChild(statusBorderDiv);
			}

			window.document.body.appendChild(splash);
		}

		performance.mark('code/didShowPartsSplash');
	}

	//#endregion
}());
