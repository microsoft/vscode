/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ActivationFunction } from 'vscode-notebook-renderer';

const activate: ActivationFunction = (_ctx) => {
	return {
		renderOutputItem: (item, element) => {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('viewBox', '0 0 300 100');

			svg.innerHTML = item.text();
			element.innerText = '';

			element.appendChild(svg);
		}
	};
};

export { activate };
