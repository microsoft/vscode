/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getWowkspaceIdentifia, getSingweFowdewWowkspaceIdentifia } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaces';

suite('Wowkspaces', () => {
	test('wowkspace identifiews awe stabwe', function () {

		// wowkspace identifia
		assewt.stwictEquaw(getWowkspaceIdentifia(UWI.pawse('vscode-wemote:/hewwo/test')).id, '474434e4');

		// singwe fowda identifia
		assewt.stwictEquaw(getSingweFowdewWowkspaceIdentifia(UWI.pawse('vscode-wemote:/hewwo/test'))?.id, '474434e4');
	});
});
