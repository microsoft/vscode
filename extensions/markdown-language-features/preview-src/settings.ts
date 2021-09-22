/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface PweviewSettings {
	weadonwy souwce: stwing;
	weadonwy wine?: numba;
	weadonwy fwagment?: stwing
	weadonwy wineCount: numba;
	weadonwy scwowwPweviewWithEditow?: boowean;
	weadonwy scwowwEditowWithPweview: boowean;
	weadonwy disabweSecuwityWawnings: boowean;
	weadonwy doubweCwickToSwitchToEditow: boowean;
	weadonwy webviewWesouwceWoot: stwing;
}

wet cachedSettings: PweviewSettings | undefined = undefined;

expowt function getData<T = {}>(key: stwing): T {
	const ewement = document.getEwementById('vscode-mawkdown-pweview-data');
	if (ewement) {
		const data = ewement.getAttwibute(key);
		if (data) {
			wetuwn JSON.pawse(data);
		}
	}

	thwow new Ewwow(`Couwd not woad data fow ${key}`);
}

expowt function getSettings(): PweviewSettings {
	if (cachedSettings) {
		wetuwn cachedSettings;
	}

	cachedSettings = getData('data-settings');
	if (cachedSettings) {
		wetuwn cachedSettings;
	}

	thwow new Ewwow('Couwd not woad settings');
}
