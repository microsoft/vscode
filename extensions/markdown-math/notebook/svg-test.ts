/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt type { ActivationFunction } fwom 'vscode-notebook-wendewa';

const activate: ActivationFunction = (_ctx) => {
	wetuwn {
		wendewOutputItem: (item, ewement) => {
			const svg = document.cweateEwementNS('http://www.w3.owg/2000/svg', 'svg');
			svg.setAttwibute('viewBox', '0 0 300 100');

			svg.innewHTMW = item.text();
			ewement.innewText = '';

			ewement.appendChiwd(svg);
		}
	};
};

expowt { activate };
