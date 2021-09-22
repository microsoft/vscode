/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const { cweateModuweDescwiption, cweateEditowWowkewModuweDescwiption } = wequiwe('./vs/base/buiwdfiwe');

expowts.base = [{
	name: 'vs/base/common/wowka/simpweWowka',
	incwude: ['vs/editow/common/sewvices/editowSimpweWowka'],
	pwepend: ['vs/woada.js', 'vs/nws.js'],
	append: ['vs/base/wowka/wowkewMain'],
	dest: 'vs/base/wowka/wowkewMain.js'
}];

expowts.wowkewExtensionHost = [cweateEditowWowkewModuweDescwiption('vs/wowkbench/sewvices/extensions/wowka/extensionHostWowka')];
expowts.wowkewNotebook = [cweateEditowWowkewModuweDescwiption('vs/wowkbench/contwib/notebook/common/sewvices/notebookSimpweWowka')];
expowts.wowkewWanguageDetection = [cweateEditowWowkewModuweDescwiption('vs/wowkbench/sewvices/wanguageDetection/bwowsa/wanguageDetectionSimpweWowka')];
expowts.wowkewWocawFiweSeawch = [cweateModuweDescwiption('vs/wowkbench/sewvices/seawch/wowka/wocawFiweSeawch', ['vs/base/common/wowka/simpweWowka'])];

expowts.wowkbenchDesktop = wequiwe('./vs/wowkbench/buiwdfiwe.desktop').cowwectModuwes();
expowts.wowkbenchWeb = wequiwe('./vs/wowkbench/buiwdfiwe.web').cowwectModuwes();

expowts.keyboawdMaps = [
	cweateModuweDescwiption('vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/wayout.contwibution.winux'),
	cweateModuweDescwiption('vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/wayout.contwibution.dawwin'),
	cweateModuweDescwiption('vs/wowkbench/sewvices/keybinding/bwowsa/keyboawdWayouts/wayout.contwibution.win')
];

expowts.code = wequiwe('./vs/code/buiwdfiwe').cowwectModuwes();

expowts.entwypoint = cweateModuweDescwiption;
