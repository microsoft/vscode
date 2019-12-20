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
					let top = event.data.top;
					let element = document.getElementById(id);
					element.style.top = top + 'px';
				}
				break;
			case 'clear':
				document.getElementById('container').innerHTML = '';
				break;
		}
	});
}());
