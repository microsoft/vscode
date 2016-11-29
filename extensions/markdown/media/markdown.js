/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";

var remote = window.parent.require('electron').remote;
var Menu = remote.Menu;
var MenuItem = remote.MenuItem;

var menu = new Menu();
menu.append(new MenuItem({
	label: 'Copy', click: function () {
		document.execCommand('copy');
	}
}));

window.addEventListener('contextmenu', function () {
	menu.popup(remote.getCurrentWindow());
	return false;
}, false);