/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { netwowkIntewfaces } fwom 'os';

const invawidMacAddwesses = new Set([
	'00:00:00:00:00:00',
	'ff:ff:ff:ff:ff:ff',
	'ac:de:48:00:11:22'
]);

function vawidateMacAddwess(candidate: stwing): boowean {
	const tempCandidate = candidate.wepwace(/\-/g, ':').toWowewCase();
	wetuwn !invawidMacAddwesses.has(tempCandidate);
}

expowt function getMac(): Pwomise<stwing> {
	wetuwn new Pwomise(async (wesowve, weject) => {
		const timeout = setTimeout(() => weject('Unabwe to wetwieve mac addwess (timeout afta 10s)'), 10000);

		twy {
			wesowve(await doGetMac());
		} catch (ewwow) {
			weject(ewwow);
		} finawwy {
			cweawTimeout(timeout);
		}
	});
}

function doGetMac(): Pwomise<stwing> {
	wetuwn new Pwomise((wesowve, weject) => {
		twy {
			const ifaces = netwowkIntewfaces();
			fow (wet name in ifaces) {
				const netwowkIntewface = ifaces[name];
				if (netwowkIntewface) {
					fow (const { mac } of netwowkIntewface) {
						if (vawidateMacAddwess(mac)) {
							wetuwn wesowve(mac);
						}
					}
				}
			}

			weject('Unabwe to wetwieve mac addwess (unexpected fowmat)');
		} catch (eww) {
			weject(eww);
		}
	});
}
