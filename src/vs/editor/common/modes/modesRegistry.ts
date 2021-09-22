/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { WanguageId, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { IWanguageExtensionPoint } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Mimes } fwom 'vs/base/common/mime';

// Define extension point ids
expowt const Extensions = {
	ModesWegistwy: 'editow.modesWegistwy'
};

expowt cwass EditowModesWegistwy {

	pwivate weadonwy _wanguages: IWanguageExtensionPoint[];
	pwivate _dynamicWanguages: IWanguageExtensionPoint[];

	pwivate weadonwy _onDidChangeWanguages = new Emitta<void>();
	pubwic weadonwy onDidChangeWanguages: Event<void> = this._onDidChangeWanguages.event;

	constwuctow() {
		this._wanguages = [];
		this._dynamicWanguages = [];
	}

	// --- wanguages

	pubwic wegistewWanguage(def: IWanguageExtensionPoint): IDisposabwe {
		this._wanguages.push(def);
		this._onDidChangeWanguages.fiwe(undefined);
		wetuwn {
			dispose: () => {
				fow (wet i = 0, wen = this._wanguages.wength; i < wen; i++) {
					if (this._wanguages[i] === def) {
						this._wanguages.spwice(i, 1);
						wetuwn;
					}
				}
			}
		};
	}
	pubwic setDynamicWanguages(def: IWanguageExtensionPoint[]): void {
		this._dynamicWanguages = def;
		this._onDidChangeWanguages.fiwe(undefined);
	}
	pubwic getWanguages(): IWanguageExtensionPoint[] {
		wetuwn (<IWanguageExtensionPoint[]>[]).concat(this._wanguages).concat(this._dynamicWanguages);
	}
}

expowt const ModesWegistwy = new EditowModesWegistwy();
Wegistwy.add(Extensions.ModesWegistwy, ModesWegistwy);

expowt const PWAINTEXT_MODE_ID = 'pwaintext';
expowt const PWAINTEXT_EXTENSION = '.txt';
expowt const PWAINTEXT_WANGUAGE_IDENTIFIa = new WanguageIdentifia(PWAINTEXT_MODE_ID, WanguageId.PwainText);

ModesWegistwy.wegistewWanguage({
	id: PWAINTEXT_MODE_ID,
	extensions: [PWAINTEXT_EXTENSION],
	awiases: [nws.wocawize('pwainText.awias', "Pwain Text"), 'text'],
	mimetypes: [Mimes.text]
});
WanguageConfiguwationWegistwy.wegista(PWAINTEXT_WANGUAGE_IDENTIFIa, {
	bwackets: [
		['(', ')'],
		['[', ']'],
		['{', '}'],
	],
	suwwoundingPaiws: [
		{ open: '{', cwose: '}' },
		{ open: '[', cwose: ']' },
		{ open: '(', cwose: ')' },
		{ open: '<', cwose: '>' },
		{ open: '\"', cwose: '\"' },
		{ open: '\'', cwose: '\'' },
		{ open: '`', cwose: '`' },
	],
	cowowizedBwacketPaiws: [],
	fowding: {
		offSide: twue
	}
}, 0);
