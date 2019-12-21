/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-case-declarations */
(function () {
	// eslint-disable-next-line no-undef
	const vscode = acquireVsCodeApi();
	console.log('a');

	window.addEventListener('message', event => {
		let id = event.data.id;

		switch (event.data.type) {
			case 'html':
				{
					let content = event.data.content;
					let newElement = document.createElement('div');
					newElement.style.position = 'absolute';
					newElement.style.top = event.data.top + 'px';
					newElement.id = id;
					document.getElementById('container').appendChild(newElement);
					newElement.innerHTML = content;
					var arr = newElement.getElementsByTagName('script');
					for (let n = 0; n < arr.length; n++) {
						eval(arr[n].innerHTML); //run script inside div
					}
					vscode.postMessage({
						type: 'dimension',
						id: id,
						data: {
							height: newElement.clientHeight
						}
					});
				}
				break;
			case 'scroll':
				{
					let element = document.getElementById(id);
					let top = event.data.top;
					if (event.data.widgetTop !== undefined) {
						let widgetTop = event.data.widgetTop;
						element.style.top = widgetTop + 'px';
						document.getElementById('container').style.top = top + 'px';
					}  else {
						document.getElementById('container').style.top = top + 'px';
					}

					vscode.postMessage({
						type: 'scroll-ack',
						id: id,
						data: {
							top: top,
						},
						version: event.data.version
					});
				}
				break;
			case 'view-scroll':
				{
					document.getElementById('container').style.top = top + 'px';
					for (let i = 0; i < event.data.widgets.length; i++) {
						let widget = document.getElementById(event.data.widgets[i].id);
						widget.style.top = event.data.widgets[i].top + 'px';
					}

					vscode.postMessage({
						type: 'scroll-ack',
						data: {
							top: top,
						},
						version: event.data.version
					});
					break;
				}
			case 'clear':
				document.getElementById('container').innerHTML = '';
				break;
		}
	});
}());
