/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const ipcRenderer = require('electron').ipcRenderer;


var initData = {};

function styleBody(body) {
	if (!body) {
		return
	}
	body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
	body.classList.add(initData.activeTheme);
}

function getTarget() {
	return document.getElementById('_target');
}

function handleInnerClick(event) {
	if (!event || !event.view || !event.view.document) {
		return;
	}
	var node = event.target;
	while (node) {
		if (node.tagName === "A" && node.href) {
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


document.addEventListener("DOMContentLoaded", function (event) {
	ipcRenderer.on('baseUrl', function (event, value) {
		initData.baseUrl = value;
	});

	ipcRenderer.on('styles', function (event, value, activeTheme) {
		initData.styles = value;
		initData.activeTheme = activeTheme;

		// webview
		var defaultStyles = document.getElementById('_defaultStyles');
		defaultStyles.innerHTML = initData.styles;

		var target = getTarget()
		if (!target) {
			return;
		}
		var body = target.contentDocument.getElementsByTagName('body');
		styleBody(body[0]);

		// iframe
		defaultStyles = getTarget().contentDocument.getElementById('_defaultStyles');
		if (defaultStyles) {
			defaultStyles.innerHTML = initData.styles;
		}
	});

	// propagate focus
	ipcRenderer.on('focus', function () {
		const target = getTarget();
		if (target) {
			target.contentWindow.focus();
		}
	});

	// update iframe-contents
	ipcRenderer.on('content', function (event, value) {
		const text = value.join('\n');
		const newDocument = new DOMParser().parseFromString(text, 'text/html');

		// know what happens here
		const stats = {
			scriptTags: newDocument.documentElement.querySelectorAll('script').length,
			inputTags: newDocument.documentElement.querySelectorAll('input').length,
			styleTags: newDocument.documentElement.querySelectorAll('style').length,
			linkStyleSheetTags: newDocument.documentElement.querySelectorAll('link[rel=stylesheet]').length,
			stringLen: text.length
		};

		// set base-url if applicable
		if (initData.baseUrl && newDocument.head.getElementsByTagName('base').length === 0) {
			const baseElement = document.createElement('base');
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

		const frame = getTarget();
		if (frame) {
			frame.setAttribute('id', '_oldTarget');
		}

		// keep current scrollTop around and use later
		const scrollTop = frame && frame.contentDocument && frame.contentDocument.body ? frame.contentDocument.body.scrollTop : 0;

		const newFrame = document.createElement('iframe');
		newFrame.setAttribute('id', '_target');
		newFrame.setAttribute('frameborder', '0');
		newFrame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
		newFrame.style.cssText = "margin: 0; overflow: hidden; position: absolute; width: 100%; height: 100%; display: none";
		document.body.appendChild(newFrame);

		// write new content onto iframe
		newFrame.contentDocument.open('text/html', 'replace');
		newFrame.contentWindow.onbeforeunload = function (e) {
			console.log('prevented webview navigation');
			return false;
		};

		// workaround for https://github.com/Microsoft/vscode/issues/12865
		// check new scrollTop and reset if neccessary
		newFrame.contentWindow.addEventListener('DOMContentLoaded', function () {
			if (newFrame.contentDocument.body && scrollTop !== newFrame.contentDocument.body.scrollTop) {
				newFrame.contentDocument.body.scrollTop = scrollTop;
			}

			// bubble out link-clicks
			if (newFrame.contentDocument.body) {
				newFrame.contentDocument.body.addEventListener('click', handleInnerClick);
			}

			if (frame) {
				document.body.removeChild(frame);
			}
			newFrame.style.display = 'block';
		});

		// set DOCTYPE for newDocument explicitly as DOMParser.parseFromString strips it off
		// and DOCTYPE is needed in the iframe to ensure that the user agent stylesheet is correctly overridden
		newFrame.contentDocument.write('<!DOCTYPE html>');
		newFrame.contentDocument.write(newDocument.documentElement.innerHTML);
		newFrame.contentDocument.close();

		ipcRenderer.sendToHost('did-set-content', stats);
	});

	// Forward message to the embedded iframe
	ipcRenderer.on('message', function (event, data) {
		const target = getTarget();
		if (target) {
			target.contentWindow.postMessage(data, document.location.origin);
		}
	});

	// forward messages from the embedded iframe
	window.onmessage = function (message) {
		ipcRenderer.sendToHost(message.data.command, message.data.data);
	};

	// signal ready
	ipcRenderer.sendToHost('webview-ready', process.pid);
});