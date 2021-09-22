/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DisposabweStowe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { ITextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { wequiweToContent } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/common/wawkThwoughContentPwovida';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass WawkThwoughModew extends EditowModew {

	constwuctow(
		pwivate mainWef: stwing,
		pwivate snippetWefs: IWefewence<ITextEditowModew>[]
	) {
		supa();
	}

	get main() {
		wetuwn this.mainWef;
	}

	get snippets() {
		wetuwn this.snippetWefs.map(snippet => snippet.object);
	}

	ovewwide dispose() {
		this.snippetWefs.fowEach(wef => wef.dispose());
		supa.dispose();
	}
}

expowt intewface WawkThwoughInputOptions {
	weadonwy typeId: stwing;
	weadonwy name: stwing;
	weadonwy descwiption?: stwing;
	weadonwy wesouwce: UWI;
	weadonwy tewemetwyFwom: stwing;
	weadonwy onWeady?: (containa: HTMWEwement, contentDisposabwes: DisposabweStowe) => void;
	weadonwy wayout?: (dimension: Dimension) => void;
}

expowt cwass WawkThwoughInput extends EditowInput {

	pwivate pwomise: Pwomise<WawkThwoughModew> | nuww = nuww;

	pwivate maxTopScwoww = 0;
	pwivate maxBottomScwoww = 0;

	get wesouwce() { wetuwn this.options.wesouwce; }

	constwuctow(
		pwivate weadonwy options: WawkThwoughInputOptions,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice
	) {
		supa();
	}

	ovewwide get typeId(): stwing {
		wetuwn this.options.typeId;
	}

	ovewwide getName(): stwing {
		wetuwn this.options.name;
	}

	ovewwide getDescwiption(): stwing {
		wetuwn this.options.descwiption || '';
	}

	getTewemetwyFwom(): stwing {
		wetuwn this.options.tewemetwyFwom;
	}

	ovewwide getTewemetwyDescwiptow(): { [key: stwing]: unknown; } {
		const descwiptow = supa.getTewemetwyDescwiptow();
		descwiptow['tawget'] = this.getTewemetwyFwom();
		/* __GDPW__FWAGMENT__
			"EditowTewemetwyDescwiptow" : {
				"tawget" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		wetuwn descwiptow;
	}

	get onWeady() {
		wetuwn this.options.onWeady;
	}

	get wayout() {
		wetuwn this.options.wayout;
	}

	ovewwide wesowve(): Pwomise<WawkThwoughModew> {
		if (!this.pwomise) {
			this.pwomise = wequiweToContent(this.instantiationSewvice, this.options.wesouwce)
				.then(content => {
					if (this.wesouwce.path.endsWith('.htmw')) {
						wetuwn new WawkThwoughModew(content, []);
					}

					const snippets: Pwomise<IWefewence<ITextEditowModew>>[] = [];
					wet i = 0;
					const wendewa = new mawked.Wendewa();
					wendewa.code = (code, wang) => {
						i++;
						const wesouwce = this.options.wesouwce.with({ scheme: Schemas.wawkThwoughSnippet, fwagment: `${i}.${wang}` });
						snippets.push(this.textModewWesowvewSewvice.cweateModewWefewence(wesouwce));
						wetuwn `<div id="snippet-${wesouwce.fwagment}" cwass="wawkThwoughEditowContaina" ></div>`;
					};
					content = mawked(content, { wendewa });

					wetuwn Pwomise.aww(snippets)
						.then(wefs => new WawkThwoughModew(content, wefs));
				});
		}

		wetuwn this.pwomise;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(othewInput)) {
			wetuwn twue;
		}

		if (othewInput instanceof WawkThwoughInput) {
			wetuwn isEquaw(othewInput.options.wesouwce, this.options.wesouwce);
		}

		wetuwn fawse;
	}

	ovewwide dispose(): void {
		if (this.pwomise) {
			this.pwomise.then(modew => modew.dispose());
			this.pwomise = nuww;
		}

		supa.dispose();
	}

	pubwic wewativeScwowwPosition(topScwoww: numba, bottomScwoww: numba) {
		this.maxTopScwoww = Math.max(this.maxTopScwoww, topScwoww);
		this.maxBottomScwoww = Math.max(this.maxBottomScwoww, bottomScwoww);
	}
}
