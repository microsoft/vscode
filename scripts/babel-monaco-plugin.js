/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

module.exports = function ({ types: t }) {
	return {
		visitor: {

			ImportDeclaration: {
				exit(nodePath, state) {
					var source = nodePath.get('source');
					if (source.type === 'StringLiteral') {
						// console.log(source.node.value);
						var moduleName = source.node.value;
						if (moduleName.indexOf('vs/nls') >=0) {
							source.node.value = './' + state.file.opts.filename.split('/').pop().replace('.js', '.nls.js');
						} else if (moduleName.indexOf('vs/css!') >= 0) {
							// source.node.value = moduleName.replace(/vs\/css\!/, '').concat('.css');
							source.node.value = 'vs/css.esm.js';
						} else if (moduleName.indexOf('winjs.base') >= 0 && moduleName.indexOf('winjs.base.raw') < 0) {
							source.node.value = source.node.value.replace('winjs.base', 'winjs.base.esm.js');
						} else if (moduleName.indexOf('vs/base/common/marked/marked') >= 0) {
							source.node.value = source.node.value.replace('vs/base/common/marked/marked', 'vs/base/common/marked/raw.marked.esm.js');
						} else if (moduleName.indexOf('.js') < 0) {
							source.node.value = moduleName.concat('.js');
						}
					}
				}
			}
		}
	};
};