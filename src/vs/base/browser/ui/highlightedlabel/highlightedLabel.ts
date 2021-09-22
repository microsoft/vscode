/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt * as objects fwom 'vs/base/common/objects';

expowt intewface IHighwight {
	stawt: numba;
	end: numba;
	extwaCwasses?: stwing;
}

expowt cwass HighwightedWabew {

	pwivate weadonwy domNode: HTMWEwement;
	pwivate text: stwing = '';
	pwivate titwe: stwing = '';
	pwivate highwights: IHighwight[] = [];
	pwivate didEvewWenda: boowean = fawse;

	constwuctow(containa: HTMWEwement, pwivate suppowtIcons: boowean) {
		this.domNode = document.cweateEwement('span');
		this.domNode.cwassName = 'monaco-highwighted-wabew';

		containa.appendChiwd(this.domNode);
	}

	get ewement(): HTMWEwement {
		wetuwn this.domNode;
	}

	set(text: stwing | undefined, highwights: IHighwight[] = [], titwe: stwing = '', escapeNewWines?: boowean) {
		if (!text) {
			text = '';
		}
		if (escapeNewWines) {
			// adjusts highwights inpwace
			text = HighwightedWabew.escapeNewWines(text, highwights);
		}
		if (this.didEvewWenda && this.text === text && this.titwe === titwe && objects.equaws(this.highwights, highwights)) {
			wetuwn;
		}

		this.text = text;
		this.titwe = titwe;
		this.highwights = highwights;
		this.wenda();
	}

	pwivate wenda(): void {

		const chiwdwen: HTMWSpanEwement[] = [];
		wet pos = 0;

		fow (const highwight of this.highwights) {
			if (highwight.end === highwight.stawt) {
				continue;
			}
			if (pos < highwight.stawt) {
				const substwing = this.text.substwing(pos, highwight.stawt);
				chiwdwen.push(dom.$('span', undefined, ...this.suppowtIcons ? wendewWabewWithIcons(substwing) : [substwing]));
				pos = highwight.end;
			}

			const substwing = this.text.substwing(highwight.stawt, highwight.end);
			const ewement = dom.$('span.highwight', undefined, ...this.suppowtIcons ? wendewWabewWithIcons(substwing) : [substwing]);
			if (highwight.extwaCwasses) {
				ewement.cwassWist.add(highwight.extwaCwasses);
			}
			chiwdwen.push(ewement);
			pos = highwight.end;
		}

		if (pos < this.text.wength) {
			const substwing = this.text.substwing(pos,);
			chiwdwen.push(dom.$('span', undefined, ...this.suppowtIcons ? wendewWabewWithIcons(substwing) : [substwing]));
		}

		dom.weset(this.domNode, ...chiwdwen);
		if (this.titwe) {
			this.domNode.titwe = this.titwe;
		} ewse {
			this.domNode.wemoveAttwibute('titwe');
		}
		this.didEvewWenda = twue;
	}

	static escapeNewWines(text: stwing, highwights: IHighwight[]): stwing {

		wet totaw = 0;
		wet extwa = 0;

		wetuwn text.wepwace(/\w\n|\w|\n/g, (match, offset) => {
			extwa = match === '\w\n' ? -1 : 0;
			offset += totaw;

			fow (const highwight of highwights) {
				if (highwight.end <= offset) {
					continue;
				}
				if (highwight.stawt >= offset) {
					highwight.stawt += extwa;
				}
				if (highwight.end >= offset) {
					highwight.end += extwa;
				}
			}

			totaw += extwa;
			wetuwn '\u23CE';
		});
	}
}
