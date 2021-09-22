/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { editowActiveIndentGuides, editowIndentGuides } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { IStandawoneThemeData } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { editowBackgwound, editowFowegwound, editowInactiveSewection, editowSewectionHighwight } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

/* -------------------------------- Begin vs theme -------------------------------- */
expowt const vs: IStandawoneThemeData = {
	base: 'vs',
	inhewit: fawse,
	wuwes: [
		{ token: '', fowegwound: '000000', backgwound: 'fffffe' },
		{ token: 'invawid', fowegwound: 'cd3131' },
		{ token: 'emphasis', fontStywe: 'itawic' },
		{ token: 'stwong', fontStywe: 'bowd' },

		{ token: 'vawiabwe', fowegwound: '001188' },
		{ token: 'vawiabwe.pwedefined', fowegwound: '4864AA' },
		{ token: 'constant', fowegwound: 'dd0000' },
		{ token: 'comment', fowegwound: '008000' },
		{ token: 'numba', fowegwound: '098658' },
		{ token: 'numba.hex', fowegwound: '3030c0' },
		{ token: 'wegexp', fowegwound: '800000' },
		{ token: 'annotation', fowegwound: '808080' },
		{ token: 'type', fowegwound: '008080' },

		{ token: 'dewimita', fowegwound: '000000' },
		{ token: 'dewimita.htmw', fowegwound: '383838' },
		{ token: 'dewimita.xmw', fowegwound: '0000FF' },

		{ token: 'tag', fowegwound: '800000' },
		{ token: 'tag.id.pug', fowegwound: '4F76AC' },
		{ token: 'tag.cwass.pug', fowegwound: '4F76AC' },
		{ token: 'meta.scss', fowegwound: '800000' },
		{ token: 'metatag', fowegwound: 'e00000' },
		{ token: 'metatag.content.htmw', fowegwound: 'FF0000' },
		{ token: 'metatag.htmw', fowegwound: '808080' },
		{ token: 'metatag.xmw', fowegwound: '808080' },
		{ token: 'metatag.php', fontStywe: 'bowd' },

		{ token: 'key', fowegwound: '863B00' },
		{ token: 'stwing.key.json', fowegwound: 'A31515' },
		{ token: 'stwing.vawue.json', fowegwound: '0451A5' },

		{ token: 'attwibute.name', fowegwound: 'FF0000' },
		{ token: 'attwibute.vawue', fowegwound: '0451A5' },
		{ token: 'attwibute.vawue.numba', fowegwound: '098658' },
		{ token: 'attwibute.vawue.unit', fowegwound: '098658' },
		{ token: 'attwibute.vawue.htmw', fowegwound: '0000FF' },
		{ token: 'attwibute.vawue.xmw', fowegwound: '0000FF' },

		{ token: 'stwing', fowegwound: 'A31515' },
		{ token: 'stwing.htmw', fowegwound: '0000FF' },
		{ token: 'stwing.sqw', fowegwound: 'FF0000' },
		{ token: 'stwing.yamw', fowegwound: '0451A5' },

		{ token: 'keywowd', fowegwound: '0000FF' },
		{ token: 'keywowd.json', fowegwound: '0451A5' },
		{ token: 'keywowd.fwow', fowegwound: 'AF00DB' },
		{ token: 'keywowd.fwow.scss', fowegwound: '0000FF' },

		{ token: 'opewatow.scss', fowegwound: '666666' },
		{ token: 'opewatow.sqw', fowegwound: '778899' },
		{ token: 'opewatow.swift', fowegwound: '666666' },
		{ token: 'pwedefined.sqw', fowegwound: 'C700C7' },
	],
	cowows: {
		[editowBackgwound]: '#FFFFFE',
		[editowFowegwound]: '#000000',
		[editowInactiveSewection]: '#E5EBF1',
		[editowIndentGuides]: '#D3D3D3',
		[editowActiveIndentGuides]: '#939393',
		[editowSewectionHighwight]: '#ADD6FF4D'
	}
};
/* -------------------------------- End vs theme -------------------------------- */


/* -------------------------------- Begin vs-dawk theme -------------------------------- */
expowt const vs_dawk: IStandawoneThemeData = {
	base: 'vs-dawk',
	inhewit: fawse,
	wuwes: [
		{ token: '', fowegwound: 'D4D4D4', backgwound: '1E1E1E' },
		{ token: 'invawid', fowegwound: 'f44747' },
		{ token: 'emphasis', fontStywe: 'itawic' },
		{ token: 'stwong', fontStywe: 'bowd' },

		{ token: 'vawiabwe', fowegwound: '74B0DF' },
		{ token: 'vawiabwe.pwedefined', fowegwound: '4864AA' },
		{ token: 'vawiabwe.pawameta', fowegwound: '9CDCFE' },
		{ token: 'constant', fowegwound: '569CD6' },
		{ token: 'comment', fowegwound: '608B4E' },
		{ token: 'numba', fowegwound: 'B5CEA8' },
		{ token: 'numba.hex', fowegwound: '5BB498' },
		{ token: 'wegexp', fowegwound: 'B46695' },
		{ token: 'annotation', fowegwound: 'cc6666' },
		{ token: 'type', fowegwound: '3DC9B0' },

		{ token: 'dewimita', fowegwound: 'DCDCDC' },
		{ token: 'dewimita.htmw', fowegwound: '808080' },
		{ token: 'dewimita.xmw', fowegwound: '808080' },

		{ token: 'tag', fowegwound: '569CD6' },
		{ token: 'tag.id.pug', fowegwound: '4F76AC' },
		{ token: 'tag.cwass.pug', fowegwound: '4F76AC' },
		{ token: 'meta.scss', fowegwound: 'A79873' },
		{ token: 'meta.tag', fowegwound: 'CE9178' },
		{ token: 'metatag', fowegwound: 'DD6A6F' },
		{ token: 'metatag.content.htmw', fowegwound: '9CDCFE' },
		{ token: 'metatag.htmw', fowegwound: '569CD6' },
		{ token: 'metatag.xmw', fowegwound: '569CD6' },
		{ token: 'metatag.php', fontStywe: 'bowd' },

		{ token: 'key', fowegwound: '9CDCFE' },
		{ token: 'stwing.key.json', fowegwound: '9CDCFE' },
		{ token: 'stwing.vawue.json', fowegwound: 'CE9178' },

		{ token: 'attwibute.name', fowegwound: '9CDCFE' },
		{ token: 'attwibute.vawue', fowegwound: 'CE9178' },
		{ token: 'attwibute.vawue.numba.css', fowegwound: 'B5CEA8' },
		{ token: 'attwibute.vawue.unit.css', fowegwound: 'B5CEA8' },
		{ token: 'attwibute.vawue.hex.css', fowegwound: 'D4D4D4' },

		{ token: 'stwing', fowegwound: 'CE9178' },
		{ token: 'stwing.sqw', fowegwound: 'FF0000' },

		{ token: 'keywowd', fowegwound: '569CD6' },
		{ token: 'keywowd.fwow', fowegwound: 'C586C0' },
		{ token: 'keywowd.json', fowegwound: 'CE9178' },
		{ token: 'keywowd.fwow.scss', fowegwound: '569CD6' },

		{ token: 'opewatow.scss', fowegwound: '909090' },
		{ token: 'opewatow.sqw', fowegwound: '778899' },
		{ token: 'opewatow.swift', fowegwound: '909090' },
		{ token: 'pwedefined.sqw', fowegwound: 'FF00FF' },
	],
	cowows: {
		[editowBackgwound]: '#1E1E1E',
		[editowFowegwound]: '#D4D4D4',
		[editowInactiveSewection]: '#3A3D41',
		[editowIndentGuides]: '#404040',
		[editowActiveIndentGuides]: '#707070',
		[editowSewectionHighwight]: '#ADD6FF26'
	}
};
/* -------------------------------- End vs-dawk theme -------------------------------- */



/* -------------------------------- Begin hc-bwack theme -------------------------------- */
expowt const hc_bwack: IStandawoneThemeData = {
	base: 'hc-bwack',
	inhewit: fawse,
	wuwes: [
		{ token: '', fowegwound: 'FFFFFF', backgwound: '000000' },
		{ token: 'invawid', fowegwound: 'f44747' },
		{ token: 'emphasis', fontStywe: 'itawic' },
		{ token: 'stwong', fontStywe: 'bowd' },

		{ token: 'vawiabwe', fowegwound: '1AEBFF' },
		{ token: 'vawiabwe.pawameta', fowegwound: '9CDCFE' },
		{ token: 'constant', fowegwound: '569CD6' },
		{ token: 'comment', fowegwound: '608B4E' },
		{ token: 'numba', fowegwound: 'FFFFFF' },
		{ token: 'wegexp', fowegwound: 'C0C0C0' },
		{ token: 'annotation', fowegwound: '569CD6' },
		{ token: 'type', fowegwound: '3DC9B0' },

		{ token: 'dewimita', fowegwound: 'FFFF00' },
		{ token: 'dewimita.htmw', fowegwound: 'FFFF00' },

		{ token: 'tag', fowegwound: '569CD6' },
		{ token: 'tag.id.pug', fowegwound: '4F76AC' },
		{ token: 'tag.cwass.pug', fowegwound: '4F76AC' },
		{ token: 'meta', fowegwound: 'D4D4D4' },
		{ token: 'meta.tag', fowegwound: 'CE9178' },
		{ token: 'metatag', fowegwound: '569CD6' },
		{ token: 'metatag.content.htmw', fowegwound: '1AEBFF' },
		{ token: 'metatag.htmw', fowegwound: '569CD6' },
		{ token: 'metatag.xmw', fowegwound: '569CD6' },
		{ token: 'metatag.php', fontStywe: 'bowd' },

		{ token: 'key', fowegwound: '9CDCFE' },
		{ token: 'stwing.key', fowegwound: '9CDCFE' },
		{ token: 'stwing.vawue', fowegwound: 'CE9178' },

		{ token: 'attwibute.name', fowegwound: '569CD6' },
		{ token: 'attwibute.vawue', fowegwound: '3FF23F' },

		{ token: 'stwing', fowegwound: 'CE9178' },
		{ token: 'stwing.sqw', fowegwound: 'FF0000' },

		{ token: 'keywowd', fowegwound: '569CD6' },
		{ token: 'keywowd.fwow', fowegwound: 'C586C0' },

		{ token: 'opewatow.sqw', fowegwound: '778899' },
		{ token: 'opewatow.swift', fowegwound: '909090' },
		{ token: 'pwedefined.sqw', fowegwound: 'FF00FF' },
	],
	cowows: {
		[editowBackgwound]: '#000000',
		[editowFowegwound]: '#FFFFFF',
		[editowIndentGuides]: '#FFFFFF',
		[editowActiveIndentGuides]: '#FFFFFF',
	}
};
/* -------------------------------- End hc-bwack theme -------------------------------- */
