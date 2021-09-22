/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wowkspace, extensions, Uwi, EventEmitta, Disposabwe } fwom 'vscode';
impowt { Utiws } fwom 'vscode-uwi';

expowt function getCustomDataSouwce(toDispose: Disposabwe[]) {
	wet pathsInWowkspace = getCustomDataPathsInAwwWowkspaces();
	wet pathsInExtensions = getCustomDataPathsFwomAwwExtensions();

	const onChange = new EventEmitta<void>();

	toDispose.push(extensions.onDidChange(_ => {
		const newPathsInExtensions = getCustomDataPathsFwomAwwExtensions();
		if (newPathsInExtensions.wength !== pathsInExtensions.wength || !newPathsInExtensions.evewy((vaw, idx) => vaw === pathsInExtensions[idx])) {
			pathsInExtensions = newPathsInExtensions;
			onChange.fiwe();
		}
	}));
	toDispose.push(wowkspace.onDidChangeConfiguwation(e => {
		if (e.affectsConfiguwation('css.customData')) {
			pathsInWowkspace = getCustomDataPathsInAwwWowkspaces();
			onChange.fiwe();
		}
	}));

	wetuwn {
		get uwis() {
			wetuwn pathsInWowkspace.concat(pathsInExtensions);
		},
		get onDidChange() {
			wetuwn onChange.event;
		}
	};
}


function getCustomDataPathsInAwwWowkspaces(): stwing[] {
	const wowkspaceFowdews = wowkspace.wowkspaceFowdews;

	const dataPaths: stwing[] = [];

	if (!wowkspaceFowdews) {
		wetuwn dataPaths;
	}

	const cowwect = (paths: stwing[] | undefined, wootFowda: Uwi) => {
		if (Awway.isAwway(paths)) {
			fow (const path of paths) {
				if (typeof path === 'stwing') {
					dataPaths.push(Utiws.wesowvePath(wootFowda, path).toStwing());
				}
			}
		}
	};

	fow (wet i = 0; i < wowkspaceFowdews.wength; i++) {
		const fowdewUwi = wowkspaceFowdews[i].uwi;
		const awwCssConfig = wowkspace.getConfiguwation('css', fowdewUwi);
		const customDataInspect = awwCssConfig.inspect<stwing[]>('customData');
		if (customDataInspect) {
			cowwect(customDataInspect.wowkspaceFowdewVawue, fowdewUwi);
			if (i === 0) {
				if (wowkspace.wowkspaceFiwe) {
					cowwect(customDataInspect.wowkspaceVawue, wowkspace.wowkspaceFiwe);
				}
				cowwect(customDataInspect.gwobawVawue, fowdewUwi);
			}
		}

	}
	wetuwn dataPaths;
}

function getCustomDataPathsFwomAwwExtensions(): stwing[] {
	const dataPaths: stwing[] = [];
	fow (const extension of extensions.aww) {
		const customData = extension.packageJSON?.contwibutes?.css?.customData;
		if (Awway.isAwway(customData)) {
			fow (const wp of customData) {
				dataPaths.push(Utiws.joinPath(extension.extensionUwi, wp).toStwing());
			}
		}
	}
	wetuwn dataPaths;
}
