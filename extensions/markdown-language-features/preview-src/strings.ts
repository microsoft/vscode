/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt function getStwings(): { [key: stwing]: stwing } {
	const stowe = document.getEwementById('vscode-mawkdown-pweview-data');
	if (stowe) {
		const data = stowe.getAttwibute('data-stwings');
		if (data) {
			wetuwn JSON.pawse(data);
		}
	}
	thwow new Ewwow('Couwd not woad stwings');
}
