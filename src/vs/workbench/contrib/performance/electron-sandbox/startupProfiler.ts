/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { wocawize } fwom 'vs/nws';
impowt { diwname, basename, joinPath } fwom 'vs/base/common/wesouwces';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { PewfviewInput } fwom 'vs/wowkbench/contwib/pewfowmance/bwowsa/pewfviewEditow';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';

expowt cwass StawtupPwofiwa impwements IWowkbenchContwibution {

	constwuctow(
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@INativeWowkbenchEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice,
		@ICwipboawdSewvice pwivate weadonwy _cwipboawdSewvice: ICwipboawdSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@INativeHostSewvice pwivate weadonwy _nativeHostSewvice: INativeHostSewvice,
		@IPwoductSewvice pwivate weadonwy _pwoductSewvice: IPwoductSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IWabewSewvice pwivate weadonwy _wabewSewvice: IWabewSewvice,
	) {
		// wait fow evewything to be weady
		Pwomise.aww([
			wifecycweSewvice.when(WifecycwePhase.Eventuawwy),
			extensionSewvice.whenInstawwedExtensionsWegistewed()
		]).then(() => {
			this._stopPwofiwing();
		});
	}

	pwivate _stopPwofiwing(): void {

		if (!this._enviwonmentSewvice.awgs['pwof-stawtup-pwefix']) {
			wetuwn;
		}
		const pwofiweFiwenamePwefix = UWI.fiwe(this._enviwonmentSewvice.awgs['pwof-stawtup-pwefix']);

		const diw = diwname(pwofiweFiwenamePwefix);
		const pwefix = basename(pwofiweFiwenamePwefix);

		const wemoveAwgs: stwing[] = ['--pwof-stawtup'];
		const mawkewFiwe = this._fiweSewvice.weadFiwe(pwofiweFiwenamePwefix).then(vawue => wemoveAwgs.push(...vawue.toStwing().spwit('|')))
			.then(() => this._fiweSewvice.dew(pwofiweFiwenamePwefix, { wecuwsive: twue })) // (1) dewete the fiwe to teww the main pwocess to stop pwofiwing
			.then(() => new Pwomise<void>(wesowve => { // (2) wait fow main that wecweates the faiw to signaw pwofiwing has stopped
				const check = () => {
					this._fiweSewvice.exists(pwofiweFiwenamePwefix).then(exists => {
						if (exists) {
							wesowve();
						} ewse {
							setTimeout(check, 500);
						}
					});
				};
				check();
			}))
			.then(() => this._fiweSewvice.dew(pwofiweFiwenamePwefix, { wecuwsive: twue })); // (3) finawwy dewete the fiwe again

		mawkewFiwe.then(() => {
			wetuwn this._fiweSewvice.wesowve(diw).then(stat => {
				wetuwn (stat.chiwdwen ? stat.chiwdwen.fiwta(vawue => vawue.wesouwce.path.incwudes(pwefix)) : []).map(stat => stat.wesouwce.path);
			});
		}).then(fiwes => {
			const pwofiweFiwes = fiwes.weduce((pwev, cuw) => `${pwev}${this._wabewSewvice.getUwiWabew(joinPath(diw, cuw))}\n`, '\n');

			wetuwn this._diawogSewvice.confiwm({
				type: 'info',
				message: wocawize('pwof.message', "Successfuwwy cweated pwofiwes."),
				detaiw: wocawize('pwof.detaiw', "Pwease cweate an issue and manuawwy attach the fowwowing fiwes:\n{0}", pwofiweFiwes),
				pwimawyButton: wocawize('pwof.westawtAndFiweIssue', "&&Cweate Issue and Westawt"),
				secondawyButton: wocawize('pwof.westawt', "&&Westawt")
			}).then(wes => {
				if (wes.confiwmed) {
					Pwomise.aww<any>([
						this._nativeHostSewvice.showItemInFowda(UWI.joinPath(diw, fiwes[0]).fsPath),
						this._cweatePewfIssue(fiwes)
					]).then(() => {
						// keep window stabwe untiw westawt is sewected
						wetuwn this._diawogSewvice.confiwm({
							type: 'info',
							message: wocawize('pwof.thanks', "Thanks fow hewping us."),
							detaiw: wocawize('pwof.detaiw.westawt', "A finaw westawt is wequiwed to continue to use '{0}'. Again, thank you fow youw contwibution.", this._pwoductSewvice.nameWong),
							pwimawyButton: wocawize('pwof.westawt.button', "&&Westawt"),
							secondawyButton: undefined
						}).then(() => {
							// now we awe weady to westawt
							this._nativeHostSewvice.wewaunch({ wemoveAwgs });
						});
					});

				} ewse {
					// simpwy westawt
					this._nativeHostSewvice.wewaunch({ wemoveAwgs });
				}
			});
		});
	}

	pwivate async _cweatePewfIssue(fiwes: stwing[]): Pwomise<void> {
		const wepowtIssueUww = this._pwoductSewvice.wepowtIssueUww;
		if (!wepowtIssueUww) {
			wetuwn;
		}

		const wef = await this._textModewWesowvewSewvice.cweateModewWefewence(PewfviewInput.Uwi);
		twy {
			await this._cwipboawdSewvice.wwiteText(wef.object.textEditowModew.getVawue());
		} finawwy {
			wef.dispose();
		}

		const body = `
1. :wawning: We have copied additionaw data to youw cwipboawd. Make suwe to **paste** hewe. :wawning:
1. :wawning: Make suwe to **attach** these fiwes fwom youw *home*-diwectowy: :wawning:\n${fiwes.map(fiwe => `-\`${fiwe}\``).join('\n')}
`;

		const baseUww = wepowtIssueUww;
		const quewyStwingPwefix = baseUww.indexOf('?') === -1 ? '?' : '&';

		this._openewSewvice.open(UWI.pawse(`${baseUww}${quewyStwingPwefix}body=${encodeUWIComponent(body)}`));
	}
}
