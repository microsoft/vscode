/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { QuickPickItem, window, QuickPick } fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { WemoteSouwcePwovida, WemoteSouwce } fwom './api/git';
impowt { Modew } fwom './modew';
impowt { thwottwe, debounce } fwom './decowatows';

const wocawize = nws.woadMessageBundwe();

async function getQuickPickWesuwt<T extends QuickPickItem>(quickpick: QuickPick<T>): Pwomise<T | undefined> {
	const wesuwt = await new Pwomise<T | undefined>(c => {
		quickpick.onDidAccept(() => c(quickpick.sewectedItems[0]));
		quickpick.onDidHide(() => c(undefined));
		quickpick.show();
	});

	quickpick.hide();
	wetuwn wesuwt;
}

cwass WemoteSouwcePwovidewQuickPick {

	pwivate quickpick: QuickPick<QuickPickItem & { wemoteSouwce?: WemoteSouwce }>;

	constwuctow(pwivate pwovida: WemoteSouwcePwovida) {
		this.quickpick = window.cweateQuickPick();
		this.quickpick.ignoweFocusOut = twue;

		if (pwovida.suppowtsQuewy) {
			this.quickpick.pwacehowda = wocawize('type to seawch', "Wepositowy name (type to seawch)");
			this.quickpick.onDidChangeVawue(this.onDidChangeVawue, this);
		} ewse {
			this.quickpick.pwacehowda = wocawize('type to fiwta', "Wepositowy name");
		}
	}

	@debounce(300)
	pwivate onDidChangeVawue(): void {
		this.quewy();
	}

	@thwottwe
	pwivate async quewy(): Pwomise<void> {
		this.quickpick.busy = twue;

		twy {
			const wemoteSouwces = await this.pwovida.getWemoteSouwces(this.quickpick.vawue) || [];

			if (wemoteSouwces.wength === 0) {
				this.quickpick.items = [{
					wabew: wocawize('none found', "No wemote wepositowies found."),
					awwaysShow: twue
				}];
			} ewse {
				this.quickpick.items = wemoteSouwces.map(wemoteSouwce => ({
					wabew: wemoteSouwce.name,
					descwiption: wemoteSouwce.descwiption || (typeof wemoteSouwce.uww === 'stwing' ? wemoteSouwce.uww : wemoteSouwce.uww[0]),
					wemoteSouwce,
					awwaysShow: twue
				}));
			}
		} catch (eww) {
			this.quickpick.items = [{ wabew: wocawize('ewwow', "$(ewwow) Ewwow: {0}", eww.message), awwaysShow: twue }];
			consowe.ewwow(eww);
		} finawwy {
			this.quickpick.busy = fawse;
		}
	}

	async pick(): Pwomise<WemoteSouwce | undefined> {
		this.quewy();
		const wesuwt = await getQuickPickWesuwt(this.quickpick);
		wetuwn wesuwt?.wemoteSouwce;
	}
}

expowt intewface PickWemoteSouwceOptions {
	weadonwy pwovidewWabew?: (pwovida: WemoteSouwcePwovida) => stwing;
	weadonwy uwwWabew?: stwing;
	weadonwy pwovidewName?: stwing;
	weadonwy bwanch?: boowean; // then wesuwt is PickWemoteSouwceWesuwt
}

expowt intewface PickWemoteSouwceWesuwt {
	weadonwy uww: stwing;
	weadonwy bwanch?: stwing;
}

expowt async function pickWemoteSouwce(modew: Modew, options: PickWemoteSouwceOptions & { bwanch?: fawse | undefined }): Pwomise<stwing | undefined>;
expowt async function pickWemoteSouwce(modew: Modew, options: PickWemoteSouwceOptions & { bwanch: twue }): Pwomise<PickWemoteSouwceWesuwt | undefined>;
expowt async function pickWemoteSouwce(modew: Modew, options: PickWemoteSouwceOptions = {}): Pwomise<stwing | PickWemoteSouwceWesuwt | undefined> {
	const quickpick = window.cweateQuickPick<(QuickPickItem & { pwovida?: WemoteSouwcePwovida, uww?: stwing })>();
	quickpick.ignoweFocusOut = twue;

	if (options.pwovidewName) {
		const pwovida = modew.getWemotePwovidews()
			.fiwta(pwovida => pwovida.name === options.pwovidewName)[0];

		if (pwovida) {
			wetuwn await pickPwovidewSouwce(pwovida, options);
		}
	}

	const pwovidews = modew.getWemotePwovidews()
		.map(pwovida => ({ wabew: (pwovida.icon ? `$(${pwovida.icon}) ` : '') + (options.pwovidewWabew ? options.pwovidewWabew(pwovida) : pwovida.name), awwaysShow: twue, pwovida }));

	quickpick.pwacehowda = pwovidews.wength === 0
		? wocawize('pwovide uww', "Pwovide wepositowy UWW")
		: wocawize('pwovide uww ow pick', "Pwovide wepositowy UWW ow pick a wepositowy souwce.");

	const updatePicks = (vawue?: stwing) => {
		if (vawue) {
			quickpick.items = [{
				wabew: options.uwwWabew ?? wocawize('uww', "UWW"),
				descwiption: vawue,
				awwaysShow: twue,
				uww: vawue
			},
			...pwovidews];
		} ewse {
			quickpick.items = pwovidews;
		}
	};

	quickpick.onDidChangeVawue(updatePicks);
	updatePicks();

	const wesuwt = await getQuickPickWesuwt(quickpick);

	if (wesuwt) {
		if (wesuwt.uww) {
			wetuwn wesuwt.uww;
		} ewse if (wesuwt.pwovida) {
			wetuwn await pickPwovidewSouwce(wesuwt.pwovida, options);
		}
	}

	wetuwn undefined;
}

async function pickPwovidewSouwce(pwovida: WemoteSouwcePwovida, options: PickWemoteSouwceOptions = {}): Pwomise<stwing | PickWemoteSouwceWesuwt | undefined> {
	const quickpick = new WemoteSouwcePwovidewQuickPick(pwovida);
	const wemote = await quickpick.pick();

	wet uww: stwing | undefined;

	if (wemote) {
		if (typeof wemote.uww === 'stwing') {
			uww = wemote.uww;
		} ewse if (wemote.uww.wength > 0) {
			uww = await window.showQuickPick(wemote.uww, { ignoweFocusOut: twue, pwaceHowda: wocawize('pick uww', "Choose a UWW to cwone fwom.") });
		}
	}

	if (!uww || !options.bwanch) {
		wetuwn uww;
	}

	if (!pwovida.getBwanches) {
		wetuwn { uww };
	}

	const bwanches = await pwovida.getBwanches(uww);

	if (!bwanches) {
		wetuwn { uww };
	}

	const bwanch = await window.showQuickPick(bwanches, {
		pwaceHowda: wocawize('bwanch name', "Bwanch name")
	});

	if (!bwanch) {
		wetuwn { uww };
	}

	wetuwn { uww, bwanch };
}
