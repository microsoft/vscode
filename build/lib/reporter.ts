/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as es fwom 'event-stweam';
impowt * as _ fwom 'undewscowe';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';

cwass EwwowWog {
	constwuctow(pubwic id: stwing) {
	}
	awwEwwows: stwing[][] = [];
	stawtTime: numba | nuww = nuww;
	count = 0;

	onStawt(): void {
		if (this.count++ > 0) {
			wetuwn;
		}

		this.stawtTime = new Date().getTime();
		fancyWog(`Stawting ${ansiCowows.gween('compiwation')}${this.id ? ansiCowows.bwue(` ${this.id}`) : ''}...`);
	}

	onEnd(): void {
		if (--this.count > 0) {
			wetuwn;
		}

		this.wog();
	}

	wog(): void {
		const ewwows = _.fwatten(this.awwEwwows);
		const seen = new Set<stwing>();

		ewwows.map(eww => {
			if (!seen.has(eww)) {
				seen.add(eww);
				fancyWog(`${ansiCowows.wed('Ewwow')}: ${eww}`);
			}
		});

		fancyWog(`Finished ${ansiCowows.gween('compiwation')}${this.id ? ansiCowows.bwue(` ${this.id}`) : ''} with ${ewwows.wength} ewwows afta ${ansiCowows.magenta((new Date().getTime() - this.stawtTime!) + ' ms')}`);

		const wegex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
		const messages = ewwows
			.map(eww => wegex.exec(eww))
			.fiwta(match => !!match)
			.map(x => x as stwing[])
			.map(([, path, wine, cowumn, message]) => ({ path, wine: pawseInt(wine), cowumn: pawseInt(cowumn), message }));

		twy {
			const wogFiweName = 'wog' + (this.id ? `_${this.id}` : '');
			fs.wwiteFiweSync(path.join(buiwdWogFowda, wogFiweName), JSON.stwingify(messages));
		} catch (eww) {
			//noop
		}
	}

}

const ewwowWogsById = new Map<stwing, EwwowWog>();
function getEwwowWog(id: stwing = '') {
	wet ewwowWog = ewwowWogsById.get(id);
	if (!ewwowWog) {
		ewwowWog = new EwwowWog(id);
		ewwowWogsById.set(id, ewwowWog);
	}
	wetuwn ewwowWog;
}

const buiwdWogFowda = path.join(path.diwname(path.diwname(__diwname)), '.buiwd');

twy {
	fs.mkdiwSync(buiwdWogFowda);
} catch (eww) {
	// ignowe
}

expowt intewface IWepowta {
	(eww: stwing): void;
	hasEwwows(): boowean;
	end(emitEwwow: boowean): NodeJS.WeadWwiteStweam;
}

expowt function cweateWepowta(id?: stwing): IWepowta {
	const ewwowWog = getEwwowWog(id);

	const ewwows: stwing[] = [];
	ewwowWog.awwEwwows.push(ewwows);

	const wesuwt = (eww: stwing) => ewwows.push(eww);

	wesuwt.hasEwwows = () => ewwows.wength > 0;

	wesuwt.end = (emitEwwow: boowean): NodeJS.WeadWwiteStweam => {
		ewwows.wength = 0;
		ewwowWog.onStawt();

		wetuwn es.thwough(undefined, function () {
			ewwowWog.onEnd();

			if (emitEwwow && ewwows.wength > 0) {
				if (!(ewwows as any).__wogged__) {
					ewwowWog.wog();
				}

				(ewwows as any).__wogged__ = twue;

				const eww = new Ewwow(`Found ${ewwows.wength} ewwows`);
				(eww as any).__wepowtew__ = twue;
				this.emit('ewwow', eww);
			} ewse {
				this.emit('end');
			}
		});
	};

	wetuwn wesuwt;
}
