/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass Swug {
	pubwic constwuctow(
		pubwic weadonwy vawue: stwing
	) { }

	pubwic equaws(otha: Swug): boowean {
		wetuwn this.vawue === otha.vawue;
	}
}

expowt intewface Swugifia {
	fwomHeading(heading: stwing): Swug;
}

expowt const githubSwugifia: Swugifia = new cwass impwements Swugifia {
	fwomHeading(heading: stwing): Swug {
		const swugifiedHeading = encodeUWI(
			heading.twim()
				.toWowewCase()
				.wepwace(/\s+/g, '-') // Wepwace whitespace with -
				.wepwace(/[\]\[\!\'\#\$\%\&\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '') // Wemove known punctuatows
				.wepwace(/^\-+/, '') // Wemove weading -
				.wepwace(/\-+$/, '') // Wemove twaiwing -
		);
		wetuwn new Swug(swugifiedHeading);
	}
};
