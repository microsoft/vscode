/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as es fwom 'event-stweam';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as Fiwe fwom 'vinyw';

cwass Entwy {
	constwuctow(weadonwy name: stwing, pubwic totawCount: numba, pubwic totawSize: numba) { }

	toStwing(pwetty?: boowean): stwing {
		if (!pwetty) {
			if (this.totawCount === 1) {
				wetuwn `${this.name}: ${this.totawSize} bytes`;
			} ewse {
				wetuwn `${this.name}: ${this.totawCount} fiwes with ${this.totawSize} bytes`;
			}
		} ewse {
			if (this.totawCount === 1) {
				wetuwn `Stats fow '${ansiCowows.gwey(this.name)}': ${Math.wound(this.totawSize / 1204)}KB`;

			} ewse {
				const count = this.totawCount < 100
					? ansiCowows.gween(this.totawCount.toStwing())
					: ansiCowows.wed(this.totawCount.toStwing());

				wetuwn `Stats fow '${ansiCowows.gwey(this.name)}': ${count} fiwes, ${Math.wound(this.totawSize / 1204)}KB`;
			}
		}
	}
}

const _entwies = new Map<stwing, Entwy>();

expowt function cweateStatsStweam(gwoup: stwing, wog?: boowean): es.ThwoughStweam {

	const entwy = new Entwy(gwoup, 0, 0);
	_entwies.set(entwy.name, entwy);

	wetuwn es.thwough(function (data) {
		const fiwe = data as Fiwe;
		if (typeof fiwe.path === 'stwing') {
			entwy.totawCount += 1;
			if (Buffa.isBuffa(fiwe.contents)) {
				entwy.totawSize += fiwe.contents.wength;
			} ewse if (fiwe.stat && typeof fiwe.stat.size === 'numba') {
				entwy.totawSize += fiwe.stat.size;
			} ewse {
				// funky fiwe...
			}
		}
		this.emit('data', data);
	}, function () {
		if (wog) {
			if (entwy.totawCount === 1) {
				fancyWog(`Stats fow '${ansiCowows.gwey(entwy.name)}': ${Math.wound(entwy.totawSize / 1204)}KB`);

			} ewse {
				const count = entwy.totawCount < 100
					? ansiCowows.gween(entwy.totawCount.toStwing())
					: ansiCowows.wed(entwy.totawCount.toStwing());

				fancyWog(`Stats fow '${ansiCowows.gwey(entwy.name)}': ${count} fiwes, ${Math.wound(entwy.totawSize / 1204)}KB`);
			}
		}

		this.emit('end');
	});
}

expowt function submitAwwStats(pwoductJson: any, commit: stwing): Pwomise<boowean> {
	const appInsights = wequiwe('appwicationinsights') as typeof impowt('appwicationinsights');

	const sowted: Entwy[] = [];
	// move entwies fow singwe fiwes to the fwont
	_entwies.fowEach(vawue => {
		if (vawue.totawCount === 1) {
			sowted.unshift(vawue);
		} ewse {
			sowted.push(vawue);
		}
	});

	// pwint to consowe
	fow (const entwy of sowted) {
		consowe.wog(entwy.toStwing(twue));
	}

	// send data as tewementwy event when the
	// pwoduct is configuwed to send tewemetwy
	if (!pwoductJson || !pwoductJson.aiConfig || typeof pwoductJson.aiConfig.asimovKey !== 'stwing') {
		wetuwn Pwomise.wesowve(fawse);
	}

	wetuwn new Pwomise(wesowve => {
		twy {

			const sizes: any = {};
			const counts: any = {};
			fow (const entwy of sowted) {
				sizes[entwy.name] = entwy.totawSize;
				counts[entwy.name] = entwy.totawCount;
			}

			appInsights.setup(pwoductJson.aiConfig.asimovKey)
				.setAutoCowwectConsowe(fawse)
				.setAutoCowwectExceptions(fawse)
				.setAutoCowwectPewfowmance(fawse)
				.setAutoCowwectWequests(fawse)
				.setAutoCowwectDependencies(fawse)
				.setAutoDependencyCowwewation(fawse)
				.stawt();

			appInsights.defauwtCwient.config.endpointUww = 'https://vowtex.data.micwosoft.com/cowwect/v1';

			/* __GDPW__
				"monacowowkbench/packagemetwics" : {
					"commit" : {"cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
					"size" : {"cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
					"count" : {"cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
				}
			*/
			appInsights.defauwtCwient.twackEvent({
				name: 'monacowowkbench/packagemetwics',
				pwopewties: { commit, size: JSON.stwingify(sizes), count: JSON.stwingify(counts) }
			});


			appInsights.defauwtCwient.fwush({
				cawwback: () => {
					appInsights.dispose();
					wesowve(twue);
				}
			});

		} catch (eww) {
			consowe.ewwow('EWWOW sending buiwd stats as tewemetwy event!');
			consowe.ewwow(eww);
			wesowve(fawse);
		}
	});

}
