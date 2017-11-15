/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
(function () {
	'use strict';

	const ipcRenderer = require('electron').ipcRenderer;

	// state
	var firstLoad = true;
	var loadTimeout;
	var pendingMessages = [];

	const initData = {
		initialScrollProgress: undefined
	};

	function styleBody(body) {
		if (!body) {
			return;
		}
		body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
		body.classList.add(initData.activeTheme);
	}

	/**
	 * @return {HTMLIFrameElement}
	 */
	function getActiveFrame() {
		return document.getElementById('active-frame');
	}

	/**
	 * @return {HTMLIFrameElement}
	 */
	function getPendingFrame() {
		return document.getElementById('pending-frame');
	}

	/**
	 * @param {MouseEvent} event
	 */
	function handleInnerClick(event) {
		if (!event || !event.view || !event.view.document) {
			return;
		}
		/** @type {any} */
		var node = event.target;
		while (node) {
			if (node.tagName && node.tagName.toLowerCase() === 'a' && node.href) {
				var baseElement = event.view.document.getElementsByTagName("base")[0];
				if (node.getAttribute("href") === "#") {
					event.view.scrollTo(0, 0);
				} else if (node.hash && (node.getAttribute("href") === node.hash || (baseElement && node.href.indexOf(baseElement.href) >= 0))) {
					var scrollTarget = event.view.document.getElementById(node.hash.substr(1, node.hash.length - 1));
					if (scrollTarget) {
						scrollTarget.scrollIntoView();
					}
				} else {
					ipcRenderer.sendToHost("did-click-link", node.href);
				}
				event.preventDefault();
				break;
			}
			node = node.parentNode;
		}
	}

	var isHandlingScroll = false;
	function handleInnerScroll(event) {
		if (isHandlingScroll) {
			return;
		}

		const progress = event.target.body.scrollTop / event.target.body.clientHeight;
		if (isNaN(progress)) {
			return;
		}

		isHandlingScroll = true;
		window.requestAnimationFrame(function () {
			try {
				ipcRenderer.sendToHost('did-scroll', progress);
			} catch (e) {
				// noop
			}
			isHandlingScroll = false;
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		ipcRenderer.on('baseUrl', function (event, value) {
			initData.baseUrl = value;
		});

		ipcRenderer.on('styles', function (event, value, activeTheme) {
			initData.styles = value;
			initData.activeTheme = activeTheme;

			// webview
			var target = getActiveFrame();
			if (!target) {
				return;
			}
			var body = target.contentDocument.getElementsByTagName('body');
			styleBody(body[0]);

			// iframe
			var defaultStyles = target.contentDocument.getElementById('_defaultStyles');
			if (defaultStyles) {
				defaultStyles.innerHTML = initData.styles;
			}
		});

		// propagate focus
		ipcRenderer.on('focus', function () {
			const target = getActiveFrame();
			if (target) {
				target.contentWindow.focus();
			}
		});

		// update iframe-contents
		ipcRenderer.on('content', function (_event, data) {
			const options = data.options;
			const text = data.contents.join('\n');
			const newDocument = new DOMParser().parseFromString(text, 'text/html');

			// set base-url if applicable
			if (initData.baseUrl && newDocument.head.getElementsByTagName('base').length === 0) {
				const baseElement = newDocument.createElement('base');
				baseElement.href = initData.baseUrl;
				newDocument.head.appendChild(baseElement);
			}

			// apply default styles
			const defaultStyles = newDocument.createElement('style');
			defaultStyles.id = '_defaultStyles';
			defaultStyles.innerHTML = initData.styles;
			if (newDocument.head.hasChildNodes()) {
				newDocument.head.insertBefore(defaultStyles, newDocument.head.firstChild);
			} else {
				newDocument.head.appendChild(defaultStyles);
			}

			styleBody(newDocument.body);

			const frame = getActiveFrame();

			// keep current scrollTop around and use later
			var setInitialScrollPosition;
			if (firstLoad) {
				firstLoad = false;
				setInitialScrollPosition = function (body) {
					if (!isNaN(initData.initialScrollProgress)) {
						if (body.scrollTop === 0) {
							body.scrollTop = body.clientHeight * initData.initialScrollProgress;
						}
					}
				};
			} else {
				const scrollY = frame && frame.contentDocument && frame.contentDocument.body ? frame.contentDocument.body.scrollTop : 0;
				setInitialScrollPosition = function (body) {
					if (body.scrollTop === 0) {
						body.scrollTop = scrollY;
					}
				};
			}

			// Clean up old pending frames and set current one as new one
			const previousPendingFrame = getPendingFrame();
			if (previousPendingFrame) {
				previousPendingFrame.setAttribute('id', '');
				document.body.removeChild(previousPendingFrame);
			}
			pendingMessages = [];

			const newFrame = document.createElement('iframe');
			newFrame.setAttribute('id', 'pending-frame');
			newFrame.setAttribute('frameborder', '0');
			newFrame.setAttribute('sandbox', options.allowScripts ? 'allow-scripts allow-forms allow-same-origin' : 'allow-same-origin');
			newFrame.style.cssText = "display: block; margin: 0; overflow: hidden; position: absolute; width: 100%; height: 100%; visibility: hidden";
			document.body.appendChild(newFrame);

			// write new content onto iframe
			newFrame.contentDocument.open('text/html', 'replace');
			newFrame.contentWindow.onbeforeunload = function () {
				console.log('prevented webview navigation');
				return false;
			};

			var onLoad = function (contentDocument, contentWindow) {
				if (contentDocument.body) {
					// Workaround for https://github.com/Microsoft/vscode/issues/12865
					// check new scrollTop and reset if neccessary
					setInitialScrollPosition(contentDocument.body);

					// Bubble out link clicks
					contentDocument.body.addEventListener('click', handleInnerClick);
				}

				const newFrame = getPendingFrame();
				if (newFrame && newFrame.contentDocument === contentDocument) {
					const oldActiveFrame = getActiveFrame();
					if (oldActiveFrame) {
						document.body.removeChild(oldActiveFrame);
					}
					newFrame.setAttribute('id', 'active-frame');
					newFrame.style.visibility = 'visible';
					contentWindow.addEventListener('scroll', handleInnerScroll);

					pendingMessages.forEach(function(data) {
						contentWindow.postMessage(data, document.location.origin);
					});
					pendingMessages = [];
				}
			};

			clearTimeout(loadTimeout);
			loadTimeout = undefined;
			loadTimeout = setTimeout(function () {
				clearTimeout(loadTimeout);
				loadTimeout = undefined;
				onLoad(newFrame.contentDocument, newFrame.contentWindow);
			}, 200);

			newFrame.contentWindow.addEventListener('load', function (e) {
				if (loadTimeout) {
					clearTimeout(loadTimeout);
					loadTimeout = undefined;
					onLoad(e.target, this);
				}
			});

			// set DOCTYPE for newDocument explicitly as DOMParser.parseFromString strips it off
			// and DOCTYPE is needed in the iframe to ensure that the user agent stylesheet is correctly overridden
			newFrame.contentDocument.write('<!DOCTYPE html>');
			newFrame.contentDocument.write(newDocument.documentElement.innerHTML);
			newFrame.contentDocument.close();

			ipcRenderer.sendToHost('did-set-content');
		});

		// Forward message to the embedded iframe
		ipcRenderer.on('message', function (event, data) {
			const pending = getPendingFrame();
			if (pending) {
				pendingMessages.push(data);
			} else {
				const target = getActiveFrame();
				if (target) {
					target.contentWindow.postMessage(data, document.location.origin);
				}
			}
		});

		ipcRenderer.on('initial-scroll-position', function (event, progress) {
			initData.initialScrollProgress = progress;
		});

		// forward messages from the embedded iframe
		window.onmessage = function (message) {
			ipcRenderer.sendToHost(message.data.command, message.data.data);
		};

		// signal ready
		ipcRenderer.sendToHost('webview-ready', process.pid);
	});
}());