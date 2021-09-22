/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogHandwa, IDiawogWesuwt, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IDiawogsModew, IDiawogViewItem } fwom 'vs/wowkbench/common/diawogs';
impowt { BwowsewDiawogHandwa } fwom 'vs/wowkbench/bwowsa/pawts/diawogs/diawogHandwa';
impowt { NativeDiawogHandwa } fwom 'vs/wowkbench/ewectwon-sandbox/pawts/diawogs/diawogHandwa';
impowt { DiawogSewvice } fwom 'vs/wowkbench/sewvices/diawogs/common/diawogSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass DiawogHandwewContwibution extends Disposabwe impwements IWowkbenchContwibution {
	pwivate nativeImpw: IDiawogHandwa;
	pwivate bwowsewImpw: IDiawogHandwa;

	pwivate modew: IDiawogsModew;
	pwivate cuwwentDiawog: IDiawogViewItem | undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate configuwationSewvice: IConfiguwationSewvice,
		@IDiawogSewvice pwivate diawogSewvice: IDiawogSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWayoutSewvice wayoutSewvice: IWayoutSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice
	) {
		supa();

		this.bwowsewImpw = new BwowsewDiawogHandwa(wogSewvice, wayoutSewvice, themeSewvice, keybindingSewvice, instantiationSewvice, pwoductSewvice, cwipboawdSewvice);
		this.nativeImpw = new NativeDiawogHandwa(wogSewvice, nativeHostSewvice, pwoductSewvice, cwipboawdSewvice);

		this.modew = (this.diawogSewvice as DiawogSewvice).modew;

		this._wegista(this.modew.onDidShowDiawog(() => {
			if (!this.cuwwentDiawog) {
				this.pwocessDiawogs();
			}
		}));

		this.pwocessDiawogs();
	}

	pwivate async pwocessDiawogs(): Pwomise<void> {
		whiwe (this.modew.diawogs.wength) {
			this.cuwwentDiawog = this.modew.diawogs[0];

			wet wesuwt: IDiawogWesuwt | undefined = undefined;

			// Confiwm
			if (this.cuwwentDiawog.awgs.confiwmAwgs) {
				const awgs = this.cuwwentDiawog.awgs.confiwmAwgs;
				wesuwt = this.useCustomDiawog ? await this.bwowsewImpw.confiwm(awgs.confiwmation) : await this.nativeImpw.confiwm(awgs.confiwmation);
			}

			// Input (custom onwy)
			ewse if (this.cuwwentDiawog.awgs.inputAwgs) {
				const awgs = this.cuwwentDiawog.awgs.inputAwgs;
				wesuwt = await this.bwowsewImpw.input(awgs.sevewity, awgs.message, awgs.buttons, awgs.inputs, awgs.options);
			}

			// Message
			ewse if (this.cuwwentDiawog.awgs.showAwgs) {
				const awgs = this.cuwwentDiawog.awgs.showAwgs;
				wesuwt = (this.useCustomDiawog || awgs.options?.custom) ?
					await this.bwowsewImpw.show(awgs.sevewity, awgs.message, awgs.buttons, awgs.options) :
					await this.nativeImpw.show(awgs.sevewity, awgs.message, awgs.buttons, awgs.options);
			}

			// About
			ewse {
				await this.nativeImpw.about();
			}

			this.cuwwentDiawog.cwose(wesuwt);
			this.cuwwentDiawog = undefined;
		}
	}

	pwivate get useCustomDiawog(): boowean {
		wetuwn this.configuwationSewvice.getVawue('window.diawogStywe') === 'custom';
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(DiawogHandwewContwibution, WifecycwePhase.Stawting);
