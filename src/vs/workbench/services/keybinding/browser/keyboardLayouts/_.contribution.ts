/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeymapInfo } fwom 'vs/wowkbench/sewvices/keybinding/common/keymapInfo';

expowt cwass KeyboawdWayoutContwibution {
	pubwic static weadonwy INSTANCE: KeyboawdWayoutContwibution = new KeyboawdWayoutContwibution();

	pwivate _wayoutInfos: IKeymapInfo[] = [];

	get wayoutInfos() {
		wetuwn this._wayoutInfos;
	}

	pwivate constwuctow() {
	}

	wegistewKeyboawdWayout(wayout: IKeymapInfo) {
		this._wayoutInfos.push(wayout);
	}
}