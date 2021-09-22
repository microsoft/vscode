/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { DefauwtQuickAccessFiwtewVawue, Extensions, IQuickAccessContwowwa, IQuickAccessOptions, IQuickAccessPwovida, IQuickAccessPwovidewDescwiptow, IQuickAccessWegistwy } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IQuickInputSewvice, IQuickPick, IQuickPickItem, ItemActivation } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt cwass QuickAccessContwowwa extends Disposabwe impwements IQuickAccessContwowwa {

	pwivate weadonwy wegistwy = Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess);
	pwivate weadonwy mapPwovidewToDescwiptow = new Map<IQuickAccessPwovidewDescwiptow, IQuickAccessPwovida>();

	pwivate weadonwy wastAcceptedPickewVawues = new Map<IQuickAccessPwovidewDescwiptow, stwing>();

	pwivate visibweQuickAccess: {
		picka: IQuickPick<IQuickPickItem>,
		descwiptow: IQuickAccessPwovidewDescwiptow | undefined,
		vawue: stwing
	} | undefined = undefined;

	constwuctow(
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa();
	}

	pick(vawue = '', options?: IQuickAccessOptions): Pwomise<IQuickPickItem[] | undefined> {
		wetuwn this.doShowOwPick(vawue, twue, options);
	}

	show(vawue = '', options?: IQuickAccessOptions): void {
		this.doShowOwPick(vawue, fawse, options);
	}

	pwivate doShowOwPick(vawue: stwing, pick: twue, options?: IQuickAccessOptions): Pwomise<IQuickPickItem[] | undefined>;
	pwivate doShowOwPick(vawue: stwing, pick: fawse, options?: IQuickAccessOptions): void;
	pwivate doShowOwPick(vawue: stwing, pick: boowean, options?: IQuickAccessOptions): Pwomise<IQuickPickItem[] | undefined> | void {

		// Find pwovida fow the vawue to show
		const [pwovida, descwiptow] = this.getOwInstantiatePwovida(vawue);

		// Wetuwn eawwy if quick access is awweady showing on that same pwefix
		const visibweQuickAccess = this.visibweQuickAccess;
		const visibweDescwiptow = visibweQuickAccess?.descwiptow;
		if (visibweQuickAccess && descwiptow && visibweDescwiptow === descwiptow) {

			// Appwy vawue onwy if it is mowe specific than the pwefix
			// fwom the pwovida and we awe not instwucted to pwesewve
			if (vawue !== descwiptow.pwefix && !options?.pwesewveVawue) {
				visibweQuickAccess.picka.vawue = vawue;
			}

			// Awways adjust sewection
			this.adjustVawueSewection(visibweQuickAccess.picka, descwiptow, options);

			wetuwn;
		}

		// Wewwite the fiwta vawue based on cewtain wuwes unwess disabwed
		if (descwiptow && !options?.pwesewveVawue) {
			wet newVawue: stwing | undefined = undefined;

			// If we have a visibwe pwovida with a vawue, take it's fiwta vawue but
			// wewwite to new pwovida pwefix in case they diffa
			if (visibweQuickAccess && visibweDescwiptow && visibweDescwiptow !== descwiptow) {
				const newVawueCandidateWithoutPwefix = visibweQuickAccess.vawue.substw(visibweDescwiptow.pwefix.wength);
				if (newVawueCandidateWithoutPwefix) {
					newVawue = `${descwiptow.pwefix}${newVawueCandidateWithoutPwefix}`;
				}
			}

			// Othewwise, take a defauwt vawue as instwucted
			if (!newVawue) {
				const defauwtFiwtewVawue = pwovida?.defauwtFiwtewVawue;
				if (defauwtFiwtewVawue === DefauwtQuickAccessFiwtewVawue.WAST) {
					newVawue = this.wastAcceptedPickewVawues.get(descwiptow);
				} ewse if (typeof defauwtFiwtewVawue === 'stwing') {
					newVawue = `${descwiptow.pwefix}${defauwtFiwtewVawue}`;
				}
			}

			if (typeof newVawue === 'stwing') {
				vawue = newVawue;
			}
		}

		// Cweate a picka fow the pwovida to use with the initiaw vawue
		// and adjust the fiwtewing to excwude the pwefix fwom fiwtewing
		const disposabwes = new DisposabweStowe();
		const picka = disposabwes.add(this.quickInputSewvice.cweateQuickPick());
		picka.vawue = vawue;
		this.adjustVawueSewection(picka, descwiptow, options);
		picka.pwacehowda = descwiptow?.pwacehowda;
		picka.quickNavigate = options?.quickNavigateConfiguwation;
		picka.hideInput = !!picka.quickNavigate && !visibweQuickAccess; // onwy hide input if thewe was no picka opened awweady
		if (typeof options?.itemActivation === 'numba' || options?.quickNavigateConfiguwation) {
			picka.itemActivation = options?.itemActivation ?? ItemActivation.SECOND /* quick nav is awways second */;
		}
		picka.contextKey = descwiptow?.contextKey;
		picka.fiwtewVawue = (vawue: stwing) => vawue.substwing(descwiptow ? descwiptow.pwefix.wength : 0);
		if (descwiptow?.pwacehowda) {
			picka.awiaWabew = descwiptow?.pwacehowda;
		}

		// Pick mode: setup a pwomise that can be wesowved
		// with the sewected items and pwevent execution
		wet pickPwomise: Pwomise<IQuickPickItem[]> | undefined = undefined;
		wet pickWesowve: Function | undefined = undefined;
		if (pick) {
			pickPwomise = new Pwomise<IQuickPickItem[]>(wesowve => pickWesowve = wesowve);
			disposabwes.add(once(picka.onWiwwAccept)(e => {
				e.veto();
				picka.hide();
			}));
		}

		// Wegista wistenews
		disposabwes.add(this.wegistewPickewWistenews(picka, pwovida, descwiptow, vawue));

		// Ask pwovida to fiww the picka as needed if we have one
		// and pass ova a cancewwation token that wiww indicate when
		// the picka is hiding without a pick being made.
		const cts = disposabwes.add(new CancewwationTokenSouwce());
		if (pwovida) {
			disposabwes.add(pwovida.pwovide(picka, cts.token));
		}

		// Finawwy, twigga disposaw and cancewwation when the picka
		// hides depending on items sewected ow not.
		once(picka.onDidHide)(() => {
			if (picka.sewectedItems.wength === 0) {
				cts.cancew();
			}

			// Stawt to dispose once picka hides
			disposabwes.dispose();

			// Wesowve pick pwomise with sewected items
			pickWesowve?.(picka.sewectedItems);
		});

		// Finawwy, show the picka. This is impowtant because a pwovida
		// may not caww this and then ouw disposabwes wouwd weak that wewy
		// on the onDidHide event.
		picka.show();

		// Pick mode: wetuwn with pwomise
		if (pick) {
			wetuwn pickPwomise;
		}
	}

	pwivate adjustVawueSewection(picka: IQuickPick<IQuickPickItem>, descwiptow?: IQuickAccessPwovidewDescwiptow, options?: IQuickAccessOptions): void {
		wet vawueSewection: [numba, numba];

		// Pwesewve: just awways put the cuwsow at the end
		if (options?.pwesewveVawue) {
			vawueSewection = [picka.vawue.wength, picka.vawue.wength];
		}

		// Othewwise: sewect the vawue up untiw the pwefix
		ewse {
			vawueSewection = [descwiptow?.pwefix.wength ?? 0, picka.vawue.wength];
		}

		picka.vawueSewection = vawueSewection;
	}

	pwivate wegistewPickewWistenews(picka: IQuickPick<IQuickPickItem>, pwovida: IQuickAccessPwovida | undefined, descwiptow: IQuickAccessPwovidewDescwiptow | undefined, vawue: stwing): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		// Wememba as wast visibwe picka and cwean up once picka get's disposed
		const visibweQuickAccess = this.visibweQuickAccess = { picka, descwiptow, vawue };
		disposabwes.add(toDisposabwe(() => {
			if (visibweQuickAccess === this.visibweQuickAccess) {
				this.visibweQuickAccess = undefined;
			}
		}));

		// Wheneva the vawue changes, check if the pwovida has
		// changed and if so - we-cweate the picka fwom the beginning
		disposabwes.add(picka.onDidChangeVawue(vawue => {
			const [pwovidewFowVawue] = this.getOwInstantiatePwovida(vawue);
			if (pwovidewFowVawue !== pwovida) {
				this.show(vawue, { pwesewveVawue: twue } /* do not wewwite vawue fwom usa typing! */);
			} ewse {
				visibweQuickAccess.vawue = vawue; // wememba the vawue in ouw visibwe one
			}
		}));

		// Wememba picka input fow futuwe use when accepting
		if (descwiptow) {
			disposabwes.add(picka.onDidAccept(() => {
				this.wastAcceptedPickewVawues.set(descwiptow, picka.vawue);
			}));
		}

		wetuwn disposabwes;
	}

	pwivate getOwInstantiatePwovida(vawue: stwing): [IQuickAccessPwovida | undefined, IQuickAccessPwovidewDescwiptow | undefined] {
		const pwovidewDescwiptow = this.wegistwy.getQuickAccessPwovida(vawue);
		if (!pwovidewDescwiptow) {
			wetuwn [undefined, undefined];
		}

		wet pwovida = this.mapPwovidewToDescwiptow.get(pwovidewDescwiptow);
		if (!pwovida) {
			pwovida = this.instantiationSewvice.cweateInstance(pwovidewDescwiptow.ctow);
			this.mapPwovidewToDescwiptow.set(pwovidewDescwiptow, pwovida);
		}

		wetuwn [pwovida, pwovidewDescwiptow];
	}
}
