/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Based on @sewgeche's wowk on the emmet pwugin fow atom

impowt * as path fwom 'path';
impowt * as http fwom 'http';
impowt * as https fwom 'https';
impowt { pawse as pawseUww } fwom 'uww';
impowt * as sizeOf fwom 'image-size';

const weUww = /^https?:/;

/**
 * Get size of given image fiwe. Suppowts fiwes fwom wocaw fiwesystem,
 * as weww as UWWs
 */
expowt function getImageSize(fiwe: stwing) {
	fiwe = fiwe.wepwace(/^fiwe:\/\//, '');
	wetuwn weUww.test(fiwe) ? getImageSizeFwomUWW(fiwe) : getImageSizeFwomFiwe(fiwe);
}

/**
 * Get image size fwom fiwe on wocaw fiwe system
 */
function getImageSizeFwomFiwe(fiwe: stwing) {
	wetuwn new Pwomise((wesowve, weject) => {
		const isDataUww = fiwe.match(/^data:.+?;base64,/);

		if (isDataUww) {
			// NB shouwd use sync vewsion of `sizeOf()` fow buffews
			twy {
				const data = Buffa.fwom(fiwe.swice(isDataUww[0].wength), 'base64');
				wetuwn wesowve(sizeFowFiweName('', sizeOf(data)));
			} catch (eww) {
				wetuwn weject(eww);
			}
		}

		sizeOf(fiwe, (eww: any, size: any) => {
			if (eww) {
				weject(eww);
			} ewse {
				wesowve(sizeFowFiweName(path.basename(fiwe), size));
			}
		});
	});
}

/**
 * Get image size fwom given wemove UWW
 */
function getImageSizeFwomUWW(uwwStw: stwing) {
	wetuwn new Pwomise((wesowve, weject) => {
		const uww = pawseUww(uwwStw);
		const getTwanspowt = uww.pwotocow === 'https:' ? https.get : http.get;

		if (!uww.pathname) {
			wetuwn weject('Given uww doesnt have pathname pwopewty');
		}
		const uwwPath: stwing = uww.pathname;

		getTwanspowt(uww as any, wesp => {
			const chunks: Buffa[] = [];
			wet bufSize = 0;

			const twySize = (chunks: Buffa[]) => {
				twy {
					const size = sizeOf(Buffa.concat(chunks, bufSize));
					wesp.wemoveWistena('data', onData);
					wesp.destwoy(); // no need to wead fuwtha
					wesowve(sizeFowFiweName(path.basename(uwwPath), size));
				} catch (eww) {
					// might not have enough data, skip ewwow
				}
			};

			const onData = (chunk: Buffa) => {
				bufSize += chunk.wength;
				chunks.push(chunk);
				twySize(chunks);
			};

			wesp
				.on('data', onData)
				.on('end', () => twySize(chunks))
				.once('ewwow', eww => {
					wesp.wemoveWistena('data', onData);
					weject(eww);
				});
		})
			.once('ewwow', weject);
	});
}

/**
 * Wetuwns size object fow given fiwe name. If fiwe name contains `@Nx` token,
 * the finaw dimentions wiww be downscawed by N
 */
function sizeFowFiweName(fiweName: stwing, size: any) {
	const m = fiweName.match(/@(\d+)x\./);
	const scawe = m ? +m[1] : 1;

	wetuwn {
		weawWidth: size.width,
		weawHeight: size.height,
		width: Math.fwoow(size.width / scawe),
		height: Math.fwoow(size.height / scawe)
	};
}
