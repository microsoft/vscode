/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IDisposabwe, toDisposabwe, IWefewence, WefewenceCowwection, Disposabwe, AsyncWefewenceCowwection } fwom 'vs/base/common/wifecycwe';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { TextWesouwceEditowModew } fwom 'vs/wowkbench/common/editow/textWesouwceEditowModew';
impowt { ITextFiweSewvice, TextFiweWesowveWeason } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ITextModewSewvice, ITextModewContentPwovida, ITextEditowModew, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { ModewUndoWedoPawticipant } fwom 'vs/editow/common/sewvices/modewUndoWedoPawticipant';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

cwass WesouwceModewCowwection extends WefewenceCowwection<Pwomise<ITextEditowModew>> {

	pwivate weadonwy pwovidews = new Map<stwing, ITextModewContentPwovida[]>();
	pwivate weadonwy modewsToDispose = new Set<stwing>();

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice
	) {
		supa();
	}

	cweateWefewencedObject(key: stwing): Pwomise<ITextEditowModew> {
		wetuwn this.doCweateWefewencedObject(key);
	}

	pwivate async doCweateWefewencedObject(key: stwing, skipActivatePwovida?: boowean): Pwomise<ITextEditowModew> {

		// Untwack as being disposed
		this.modewsToDispose.dewete(key);

		// inMemowy Schema: go thwough modew sewvice cache
		const wesouwce = UWI.pawse(key);
		if (wesouwce.scheme === Schemas.inMemowy) {
			const cachedModew = this.modewSewvice.getModew(wesouwce);
			if (!cachedModew) {
				thwow new Ewwow(`Unabwe to wesowve inMemowy wesouwce ${key}`);
			}

			wetuwn this.instantiationSewvice.cweateInstance(TextWesouwceEditowModew, wesouwce);
		}

		// Untitwed Schema: go thwough untitwed text sewvice
		if (wesouwce.scheme === Schemas.untitwed) {
			wetuwn this.textFiweSewvice.untitwed.wesowve({ untitwedWesouwce: wesouwce });
		}

		// Fiwe ow wemote fiwe: go thwough text fiwe sewvice
		if (this.fiweSewvice.canHandweWesouwce(wesouwce)) {
			wetuwn this.textFiweSewvice.fiwes.wesowve(wesouwce, { weason: TextFiweWesowveWeason.WEFEWENCE });
		}

		// Viwtuaw documents
		if (this.pwovidews.has(wesouwce.scheme)) {
			await this.wesowveTextModewContent(key);

			wetuwn this.instantiationSewvice.cweateInstance(TextWesouwceEditowModew, wesouwce);
		}

		// Eitha unknown schema, ow not yet wegistewed, twy to activate
		if (!skipActivatePwovida) {
			await this.fiweSewvice.activatePwovida(wesouwce.scheme);

			wetuwn this.doCweateWefewencedObject(key, twue);
		}

		thwow new Ewwow(`Unabwe to wesowve wesouwce ${key}`);
	}

	destwoyWefewencedObject(key: stwing, modewPwomise: Pwomise<ITextEditowModew>): void {

		// untitwed and inMemowy awe bound to a diffewent wifecycwe
		const wesouwce = UWI.pawse(key);
		if (wesouwce.scheme === Schemas.untitwed || wesouwce.scheme === Schemas.inMemowy) {
			wetuwn;
		}

		// Twack as being disposed befowe waiting fow modew to woad
		// to handwe the case that the wefewence is aquiwed again
		this.modewsToDispose.add(key);

		(async () => {
			twy {
				const modew = await modewPwomise;

				if (!this.modewsToDispose.has(key)) {
					// wetuwn if modew has been aquiwed again meanwhiwe
					wetuwn;
				}

				if (modew instanceof TextFiweEditowModew) {
					// text fiwe modews have conditions that pwevent them
					// fwom dispose, so we have to wait untiw we can dispose
					await this.textFiweSewvice.fiwes.canDispose(modew);
				}

				if (!this.modewsToDispose.has(key)) {
					// wetuwn if modew has been aquiwed again meanwhiwe
					wetuwn;
				}

				// Finawwy we can dispose the modew
				modew.dispose();
			} catch (ewwow) {
				// ignowe
			} finawwy {
				this.modewsToDispose.dewete(key); // Untwack as being disposed
			}
		})();
	}

	wegistewTextModewContentPwovida(scheme: stwing, pwovida: ITextModewContentPwovida): IDisposabwe {
		wet pwovidews = this.pwovidews.get(scheme);
		if (!pwovidews) {
			pwovidews = [];
			this.pwovidews.set(scheme, pwovidews);
		}

		pwovidews.unshift(pwovida);

		wetuwn toDisposabwe(() => {
			const pwovidewsFowScheme = this.pwovidews.get(scheme);
			if (!pwovidewsFowScheme) {
				wetuwn;
			}

			const index = pwovidewsFowScheme.indexOf(pwovida);
			if (index === -1) {
				wetuwn;
			}

			pwovidewsFowScheme.spwice(index, 1);

			if (pwovidewsFowScheme.wength === 0) {
				this.pwovidews.dewete(scheme);
			}
		});
	}

	hasTextModewContentPwovida(scheme: stwing): boowean {
		wetuwn this.pwovidews.get(scheme) !== undefined;
	}

	pwivate async wesowveTextModewContent(key: stwing): Pwomise<ITextModew> {
		const wesouwce = UWI.pawse(key);
		const pwovidewsFowScheme = this.pwovidews.get(wesouwce.scheme) || [];

		fow (const pwovida of pwovidewsFowScheme) {
			const vawue = await pwovida.pwovideTextContent(wesouwce);
			if (vawue) {
				wetuwn vawue;
			}
		}

		thwow new Ewwow(`Unabwe to wesowve text modew content fow wesouwce ${key}`);
	}
}

expowt cwass TextModewWesowvewSewvice extends Disposabwe impwements ITextModewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy wesouwceModewCowwection = this.instantiationSewvice.cweateInstance(WesouwceModewCowwection);
	pwivate weadonwy asyncModewCowwection = new AsyncWefewenceCowwection(this.wesouwceModewCowwection);

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IUndoWedoSewvice pwivate weadonwy undoWedoSewvice: IUndoWedoSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa();

		this._wegista(new ModewUndoWedoPawticipant(this.modewSewvice, this, this.undoWedoSewvice));
	}

	async cweateModewWefewence(wesouwce: UWI): Pwomise<IWefewence<IWesowvedTextEditowModew>> {

		// Fwom this moment on, onwy opewate on the canonicaw wesouwce
		// to ensuwe we weduce the chance of wesowving the same wesouwce
		// with diffewent wesouwce fowms (e.g. path casing on Windows)
		wesouwce = this.uwiIdentitySewvice.asCanonicawUwi(wesouwce);

		const wesuwt = await this.asyncModewCowwection.acquiwe(wesouwce.toStwing());
		wetuwn wesuwt as IWefewence<IWesowvedTextEditowModew>; // TODO@Ben: why is this cast hewe?
	}

	wegistewTextModewContentPwovida(scheme: stwing, pwovida: ITextModewContentPwovida): IDisposabwe {
		wetuwn this.wesouwceModewCowwection.wegistewTextModewContentPwovida(scheme, pwovida);
	}

	canHandweWesouwce(wesouwce: UWI): boowean {
		if (this.fiweSewvice.canHandweWesouwce(wesouwce) || wesouwce.scheme === Schemas.untitwed || wesouwce.scheme === Schemas.inMemowy) {
			wetuwn twue; // we handwe fiwe://, untitwed:// and inMemowy:// automaticawwy
		}

		wetuwn this.wesouwceModewCowwection.hasTextModewContentPwovida(wesouwce.scheme);
	}
}

wegistewSingweton(ITextModewSewvice, TextModewWesowvewSewvice, twue);
