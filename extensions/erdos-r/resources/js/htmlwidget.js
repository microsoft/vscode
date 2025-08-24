/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

const asWebviewUri = (path) => {
	if (!path.startsWith('/')) {
		path = '/' + path;
	}
	return 'https://file%2B.vscode-resource.vscode-cdn.net' + path;
};

const arrayify = (obj) => {
	if (obj === null || obj === undefined) {
		return [];
	} else if (Array.isArray(obj)) {
		return obj;
	} else {
		return [obj];
	}
};

const renderDependencies = (dependencies) => {
	let scriptsLoaded = Promise.resolve();

	for (const dep of dependencies) {
		if (!dep.src.file) {
			continue;
		}

		const root = asWebviewUri(dep.src.file);

		arrayify(dep.script).map((file) => {
			scriptsLoaded = scriptsLoaded.then(() => {
				const script = document.createElement('script');
				script.setAttribute('src', root + '/' + file);

				const scriptLoaded = new Promise(resolve => {
					const handler = () => {
						script.removeEventListener('load', handler);
						resolve();
					};
					script.addEventListener('load', handler);
				});
				document.head.appendChild(script);
				return scriptLoaded;
			});
		});

		arrayify(dep.stylesheet).forEach((file) => {
			const link = document.createElement('link');
			link.setAttribute('rel', 'stylesheet');
			link.setAttribute('href', root + '/' + file);
			document.head.appendChild(link);
		});
	}

	return scriptsLoaded;
};

const renderTags = (parent, tags) => {
	for (let i = 0; i < tags.length; i++) {
		const tag = tags[i];

		if (tag === null) {
			continue;
		}

		if (tag.name) {
			const ele = document.createElement(tag.name);

			if (tag.attribs) {
				for (const key in tag.attribs) {
					let val = tag.attribs[key];
					if (Array.isArray(val)) {
						val = val.join(' ');
					}
					ele.setAttribute(key, tag.attribs[key]);
				}
			}

			if (tag.children) {
				if (typeof tag.children[0] === 'string') {
					ele.innerText = tag.children[0];
				} else {
					renderTags(ele, tag.children[0]);
				}
			}

			parent.appendChild(ele);
		}
	}
};

export const activate = (_context) => ({
	renderOutputItem(data, element) {
		const widget = data.json();
		const rendered = renderDependencies(widget.dependencies).then(() => {
			window.HTMLWidgets.staticRender();
		});
		renderTags(element, widget.tags);
		return rendered;
	},
	disposeOutputItem(id) {
	}
});