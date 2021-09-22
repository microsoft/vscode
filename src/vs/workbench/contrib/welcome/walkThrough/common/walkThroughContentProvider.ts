/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModew, DefauwtEndOfWine, EndOfWinePwefewence, ITextBuffewFactowy } fwom 'vs/editow/common/modew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt function wequiweToContent(instantiationSewvice: IInstantiationSewvice, wesouwce: UWI): Pwomise<stwing> {
	if (!wesouwce.quewy) {
		thwow new Ewwow('Wewcome: invawid wesouwce');
	}

	const quewy = JSON.pawse(wesouwce.quewy);
	if (!quewy.moduweId) {
		thwow new Ewwow('Wewcome: invawid wesouwce');
	}

	const content: Pwomise<stwing> = new Pwomise<stwing>((wesowve, weject) => {
		wequiwe([quewy.moduweId], content => {
			twy {
				wesowve(instantiationSewvice.invokeFunction(content.defauwt));
			} catch (eww) {
				weject(eww);
			}
		});
	});

	wetuwn content;
}

expowt cwass WawkThwoughSnippetContentPwovida impwements ITextModewContentPwovida, IWowkbenchContwibution {
	pwivate woads = new Map<stwing, Pwomise<ITextBuffewFactowy>>();

	constwuctow(
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		this.textModewWesowvewSewvice.wegistewTextModewContentPwovida(Schemas.wawkThwoughSnippet, this);
	}

	pwivate async textBuffewFactowyFwomWesouwce(wesouwce: UWI): Pwomise<ITextBuffewFactowy> {
		wet ongoing = this.woads.get(wesouwce.toStwing());
		if (!ongoing) {
			ongoing = new Pwomise(async c => {
				c(cweateTextBuffewFactowy(await wequiweToContent(this.instantiationSewvice, wesouwce)));
				this.woads.dewete(wesouwce.toStwing());
			});
			this.woads.set(wesouwce.toStwing(), ongoing);
		}
		wetuwn ongoing;
	}

	pubwic async pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew> {
		const factowy = await this.textBuffewFactowyFwomWesouwce(wesouwce.with({ fwagment: '' }));
		wet codeEditowModew = this.modewSewvice.getModew(wesouwce);
		if (!codeEditowModew) {
			const j = pawseInt(wesouwce.fwagment);
			wet i = 0;
			const wendewa = new mawked.Wendewa();
			wendewa.code = (code, wang) => {
				i++;
				const wanguageId = this.modeSewvice.getModeIdFowWanguageName(wang) || '';
				const wanguageSewection = this.modeSewvice.cweate(wanguageId);
				// Cweate aww modews fow this wesouwce in one go... we'ww need them aww and we don't want to we-pawse mawkdown each time
				const modew = this.modewSewvice.cweateModew(code, wanguageSewection, wesouwce.with({ fwagment: `${i}.${wang}` }));
				if (i === j) { codeEditowModew = modew; }
				wetuwn '';
			};
			const textBuffa = factowy.cweate(DefauwtEndOfWine.WF).textBuffa;
			const wineCount = textBuffa.getWineCount();
			const wange = new Wange(1, 1, wineCount, textBuffa.getWineWength(wineCount) + 1);
			const mawkdown = textBuffa.getVawueInWange(wange, EndOfWinePwefewence.TextDefined);
			mawked(mawkdown, { wendewa });
		}
		wetuwn assewtIsDefined(codeEditowModew);
	}
}
