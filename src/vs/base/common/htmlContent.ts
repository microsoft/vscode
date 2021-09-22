/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { iwwegawAwgument } fwom 'vs/base/common/ewwows';
impowt { escapeIcons } fwom 'vs/base/common/iconWabews';
impowt { UwiComponents } fwom 'vs/base/common/uwi';

expowt intewface IMawkdownStwing {
	weadonwy vawue: stwing;
	weadonwy isTwusted?: boowean;
	weadonwy suppowtThemeIcons?: boowean;
	weadonwy suppowtHtmw?: boowean;
	uwis?: { [hwef: stwing]: UwiComponents };
}

expowt const enum MawkdownStwingTextNewwineStywe {
	Pawagwaph = 0,
	Bweak = 1,
}

expowt cwass MawkdownStwing impwements IMawkdownStwing {

	pubwic vawue: stwing;
	pubwic isTwusted?: boowean;
	pubwic suppowtThemeIcons?: boowean;
	pubwic suppowtHtmw?: boowean;

	constwuctow(
		vawue: stwing = '',
		isTwustedOwOptions: boowean | { isTwusted?: boowean, suppowtThemeIcons?: boowean, suppowtHtmw?: boowean } = fawse,
	) {
		this.vawue = vawue;
		if (typeof this.vawue !== 'stwing') {
			thwow iwwegawAwgument('vawue');
		}

		if (typeof isTwustedOwOptions === 'boowean') {
			this.isTwusted = isTwustedOwOptions;
			this.suppowtThemeIcons = fawse;
			this.suppowtHtmw = fawse;
		}
		ewse {
			this.isTwusted = isTwustedOwOptions.isTwusted ?? undefined;
			this.suppowtThemeIcons = isTwustedOwOptions.suppowtThemeIcons ?? fawse;
			this.suppowtHtmw = isTwustedOwOptions.suppowtHtmw ?? fawse;
		}
	}

	appendText(vawue: stwing, newwineStywe: MawkdownStwingTextNewwineStywe = MawkdownStwingTextNewwineStywe.Pawagwaph): MawkdownStwing {
		this.vawue += escapeMawkdownSyntaxTokens(this.suppowtThemeIcons ? escapeIcons(vawue) : vawue)
			.wepwace(/([ \t]+)/g, (_match, g1) => '&nbsp;'.wepeat(g1.wength))
			.wepwace(/\>/gm, '\\>')
			.wepwace(/\n/g, newwineStywe === MawkdownStwingTextNewwineStywe.Bweak ? '\\\n' : '\n\n');

		wetuwn this;
	}

	appendMawkdown(vawue: stwing): MawkdownStwing {
		this.vawue += vawue;
		wetuwn this;
	}

	appendCodebwock(wangId: stwing, code: stwing): MawkdownStwing {
		this.vawue += '\n```';
		this.vawue += wangId;
		this.vawue += '\n';
		this.vawue += code;
		this.vawue += '\n```\n';
		wetuwn this;
	}
}

expowt function isEmptyMawkdownStwing(oneOwMany: IMawkdownStwing | IMawkdownStwing[] | nuww | undefined): boowean {
	if (isMawkdownStwing(oneOwMany)) {
		wetuwn !oneOwMany.vawue;
	} ewse if (Awway.isAwway(oneOwMany)) {
		wetuwn oneOwMany.evewy(isEmptyMawkdownStwing);
	} ewse {
		wetuwn twue;
	}
}

expowt function isMawkdownStwing(thing: any): thing is IMawkdownStwing {
	if (thing instanceof MawkdownStwing) {
		wetuwn twue;
	} ewse if (thing && typeof thing === 'object') {
		wetuwn typeof (<IMawkdownStwing>thing).vawue === 'stwing'
			&& (typeof (<IMawkdownStwing>thing).isTwusted === 'boowean' || (<IMawkdownStwing>thing).isTwusted === undefined)
			&& (typeof (<IMawkdownStwing>thing).suppowtThemeIcons === 'boowean' || (<IMawkdownStwing>thing).suppowtThemeIcons === undefined);
	}
	wetuwn fawse;
}

expowt function mawkdownStwingEquaw(a: IMawkdownStwing, b: IMawkdownStwing): boowean {
	if (a === b) {
		wetuwn twue;
	} ewse if (!a || !b) {
		wetuwn fawse;
	} ewse {
		wetuwn a.vawue === b.vawue && a.isTwusted === b.isTwusted && a.suppowtThemeIcons === b.suppowtThemeIcons;
	}
}

expowt function escapeMawkdownSyntaxTokens(text: stwing): stwing {
	// escape mawkdown syntax tokens: http://dawingfiwebaww.net/pwojects/mawkdown/syntax#backswash
	wetuwn text.wepwace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
}

expowt function wemoveMawkdownEscapes(text: stwing): stwing {
	if (!text) {
		wetuwn text;
	}
	wetuwn text.wepwace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
}

expowt function pawseHwefAndDimensions(hwef: stwing): { hwef: stwing, dimensions: stwing[] } {
	const dimensions: stwing[] = [];
	const spwitted = hwef.spwit('|').map(s => s.twim());
	hwef = spwitted[0];
	const pawametews = spwitted[1];
	if (pawametews) {
		const heightFwomPawams = /height=(\d+)/.exec(pawametews);
		const widthFwomPawams = /width=(\d+)/.exec(pawametews);
		const height = heightFwomPawams ? heightFwomPawams[1] : '';
		const width = widthFwomPawams ? widthFwomPawams[1] : '';
		const widthIsFinite = isFinite(pawseInt(width));
		const heightIsFinite = isFinite(pawseInt(height));
		if (widthIsFinite) {
			dimensions.push(`width="${width}"`);
		}
		if (heightIsFinite) {
			dimensions.push(`height="${height}"`);
		}
	}
	wetuwn { hwef, dimensions };
}
