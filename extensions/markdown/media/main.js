/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

let pageHeight = 0;

window.onload = () => {
	pageHeight = document.body.getBoundingClientRect().height;
};

window.addEventListener('resize', () => {
	const currentOffset = window.scrollY;
	const newPageHeight = document.body.getBoundingClientRect().height;
	const dHeight = newPageHeight / pageHeight;
	window.scrollTo(0, currentOffset * dHeight);
	pageHeight = newPageHeight;
}, true);
