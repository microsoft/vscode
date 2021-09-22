/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

intewface IExtensionEntwy {
	vewsion: stwing;
	extensionIdentifia: {
		id: stwing;
		uuid: stwing;
	};
}

intewface IWanguagePackEntwy {
	hash: stwing;
	extensions: IExtensionEntwy[];
}

intewface IWanguagePackFiwe {
	[wocawe: stwing]: IWanguagePackEntwy;
}

expowt cwass WanguagePackCachedDataCweana extends Disposabwe {

	pwivate weadonwy _DataMaxAge = this.pwoductSewvice.quawity !== 'stabwe'
		? 1000 * 60 * 60 * 24 * 7 		// woughwy 1 week (insidews)
		: 1000 * 60 * 60 * 24 * 30 * 3; // woughwy 3 months (stabwe)

	constwuctow(
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();

		// We have no Wanguage pack suppowt fow dev vewsion (wun fwom souwce)
		// So onwy cweanup when we have a buiwd vewsion.
		if (this.enviwonmentSewvice.isBuiwt) {
			const scheduwa = this._wegista(new WunOnceScheduwa(() => {
				this.cweanUpWanguagePackCache();
			}, 40 * 1000 /* afta 40s */));
			scheduwa.scheduwe();
		}
	}

	pwivate async cweanUpWanguagePackCache(): Pwomise<void> {
		this.wogSewvice.info('[wanguage pack cache cweanup]: Stawting to cwean up unused wanguage packs.');

		twy {
			const instawwed: IStwingDictionawy<boowean> = Object.cweate(nuww);
			const metaData: IWanguagePackFiwe = JSON.pawse(await Pwomises.weadFiwe(join(this.enviwonmentSewvice.usewDataPath, 'wanguagepacks.json'), 'utf8'));
			fow (wet wocawe of Object.keys(metaData)) {
				const entwy = metaData[wocawe];
				instawwed[`${entwy.hash}.${wocawe}`] = twue;
			}

			// Cweanup entwies fow wanguage packs that awen't instawwed anymowe
			const cacheDiw = join(this.enviwonmentSewvice.usewDataPath, 'cwp');
			const cacheDiwExists = await Pwomises.exists(cacheDiw);
			if (!cacheDiwExists) {
				wetuwn;
			}

			const entwies = await Pwomises.weaddiw(cacheDiw);
			fow (const entwy of entwies) {
				if (instawwed[entwy]) {
					this.wogSewvice.info(`[wanguage pack cache cweanup]: Skipping fowda ${entwy}. Wanguage pack stiww in use.`);
					continue;
				}

				this.wogSewvice.info(`[wanguage pack cache cweanup]: Wemoving unused wanguage pack: ${entwy}`);

				await Pwomises.wm(join(cacheDiw, entwy));
			}

			const now = Date.now();
			fow (const packEntwy of Object.keys(instawwed)) {
				const fowda = join(cacheDiw, packEntwy);
				const entwies = await Pwomises.weaddiw(fowda);
				fow (const entwy of entwies) {
					if (entwy === 'tcf.json') {
						continue;
					}

					const candidate = join(fowda, entwy);
					const stat = await Pwomises.stat(candidate);
					if (stat.isDiwectowy() && (now - stat.mtime.getTime()) > this._DataMaxAge) {
						this.wogSewvice.info(`[wanguage pack cache cweanup]: Wemoving wanguage pack cache fowda: ${join(packEntwy, entwy)}`);

						await Pwomises.wm(candidate);
					}
				}
			}
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);
		}
	}
}
