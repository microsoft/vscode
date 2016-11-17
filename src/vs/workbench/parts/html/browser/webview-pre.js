/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var initData = {};

function styleBody(body) {
	if (!body) {
		return
	}
	body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast');
	body.classList.add(initData.activeTheme);
};

function getTarget() {
	return document.getElementById('_target');
};

const ipcRenderer = require('electron').ipcRenderer;

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

		var body = getTarget().contentDocument.getElementsByTagName('body');
		styleBody(body[0]);

		// iframe
		defaultStyles = getTarget().contentDocument.getElementById('_defaultStyles');
		if (defaultStyles) {
			defaultStyles.innerHTML = initData.styles;
		}
	});

	// propagate focus
	ipcRenderer.on('focus', function () {
		getTarget().contentWindow.focus();
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

		// script to bubble out link-clicks
		const defaultScripts = newDocument.createElement('script');
		defaultScripts.innerHTML = [
			'document.body.addEventListener("click", function(event) {',
			'	let node = event.target;',
			'	while (node) {',
			'		if (node.tagName === "A" && node.href) {',
			'			let baseElement = window.document.getElementsByTagName("base")[0];',
			'			if (baseElement && node.href.indexOf(baseElement.href) >= 0 && node.hash) {',
			'				let scrollTarget = window.document.getElementById(node.hash.substr(1, node.hash.length - 1));',
			'				if (scrollTarget) {',
			'					scrollgetTarget().scrollIntoView();',
			'				}',
			'			} else {',
			'				window.parent.postMessage({ command: "did-click-link", data: node.href }, "file://");',
			'			}',
			'			event.preventDefault();',
			'			break;',
			'		}',
			'		node = node.parentNode;',
			'	}',
			'});'].join('\n')


		newDocument.body.appendChild(defaultScripts);
		styleBody(newDocument.body);

		// keep current scrollTop around and use later
		const scrollTop = getTarget().contentDocument.body.scrollTop;

		// write new content onto iframe
		getTarget().contentDocument.open('text/html', 'replace');
		// set DOCTYPE for newDocument explicitly as DOMParser.parseFromString strips it off
		// and DOCTYPE is needed in the iframe to ensure that the user agent stylesheet is correctly overridden
		getTarget().contentDocument.write('<!DOCTYPE html>');
		getTarget().contentDocument.write(newDocument.documentElement.innerHTML);
		getTarget().contentDocument.close();

		// workaround for https://github.com/Microsoft/vscode/issues/12865
		// check new scrollTop and reset if neccessary
		setTimeout(function () {
			if (scrollTop !== getTarget().contentDocument.body.scrollTop) {
				getTarget().contentDocument.body.scrollTop = scrollTop;
			}
		}, 0);

		ipcRenderer.sendToHost('did-set-content', stats);
	});

	// forward messages from the embedded iframe
	window.onmessage = function (message) {
		ipcRenderer.sendToHost(message.data.command, message.data.data);
	};

	// signal ready
	ipcRenderer.sendToHost('webview-ready', process.pid);
});
