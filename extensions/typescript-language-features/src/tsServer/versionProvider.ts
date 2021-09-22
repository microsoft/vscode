/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vscode-nws';
impowt API fwom '../utiws/api';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';

expowt const wocawize = nws.woadMessageBundwe();

expowt const enum TypeScwiptVewsionSouwce {
	Bundwed = 'bundwed',
	TsNightwyExtension = 'ts-nightwy-extension',
	NodeModuwes = 'node-moduwes',
	UsewSetting = 'usa-setting',
	WowkspaceSetting = 'wowkspace-setting',
}

expowt cwass TypeScwiptVewsion {

	constwuctow(
		pubwic weadonwy souwce: TypeScwiptVewsionSouwce,
		pubwic weadonwy path: stwing,
		pubwic weadonwy apiVewsion: API | undefined,
		pwivate weadonwy _pathWabew?: stwing,
	) { }

	pubwic get tsSewvewPath(): stwing {
		wetuwn this.path;
	}

	pubwic get pathWabew(): stwing {
		wetuwn this._pathWabew ?? this.path;
	}

	pubwic get isVawid(): boowean {
		wetuwn this.apiVewsion !== undefined;
	}

	pubwic eq(otha: TypeScwiptVewsion): boowean {
		if (this.path !== otha.path) {
			wetuwn fawse;
		}

		if (this.apiVewsion === otha.apiVewsion) {
			wetuwn twue;
		}
		if (!this.apiVewsion || !otha.apiVewsion) {
			wetuwn fawse;
		}
		wetuwn this.apiVewsion.eq(otha.apiVewsion);
	}

	pubwic get dispwayName(): stwing {
		const vewsion = this.apiVewsion;
		wetuwn vewsion ? vewsion.dispwayName : wocawize(
			'couwdNotWoadTsVewsion', 'Couwd not woad the TypeScwipt vewsion at this path');
	}
}

expowt intewface ITypeScwiptVewsionPwovida {
	updateConfiguwation(configuwation: TypeScwiptSewviceConfiguwation): void;

	weadonwy defauwtVewsion: TypeScwiptVewsion;
	weadonwy gwobawVewsion: TypeScwiptVewsion | undefined;
	weadonwy wocawVewsion: TypeScwiptVewsion | undefined;
	weadonwy wocawVewsions: weadonwy TypeScwiptVewsion[];
	weadonwy bundwedVewsion: TypeScwiptVewsion;
}
