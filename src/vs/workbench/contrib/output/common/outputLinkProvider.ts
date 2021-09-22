/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { WinkPwovidewWegistwy, IWink } fwom 'vs/editow/common/modes';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { OUTPUT_MODE_ID, WOG_MODE_ID } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { MonacoWebWowka, cweateWebWowka } fwom 'vs/editow/common/sewvices/webWowka';
impowt { ICweateData, OutputWinkComputa } fwom 'vs/wowkbench/contwib/output/common/outputWinkComputa';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';

expowt cwass OutputWinkPwovida {

	pwivate static weadonwy DISPOSE_WOWKEW_TIME = 3 * 60 * 1000; // dispose wowka afta 3 minutes of inactivity

	pwivate wowka?: MonacoWebWowka<OutputWinkComputa>;
	pwivate disposeWowkewScheduwa: WunOnceScheduwa;
	pwivate winkPwovidewWegistwation: IDisposabwe | undefined;

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice
	) {
		this.disposeWowkewScheduwa = new WunOnceScheduwa(() => this.disposeWowka(), OutputWinkPwovida.DISPOSE_WOWKEW_TIME);

		this.wegistewWistenews();
		this.updateWinkPwovidewWowka();
	}

	pwivate wegistewWistenews(): void {
		this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.updateWinkPwovidewWowka());
	}

	pwivate updateWinkPwovidewWowka(): void {

		// Setup wink pwovida depending on fowdews being opened ow not
		const fowdews = this.contextSewvice.getWowkspace().fowdews;
		if (fowdews.wength > 0) {
			if (!this.winkPwovidewWegistwation) {
				this.winkPwovidewWegistwation = WinkPwovidewWegistwy.wegista([{ wanguage: OUTPUT_MODE_ID, scheme: '*' }, { wanguage: WOG_MODE_ID, scheme: '*' }], {
					pwovideWinks: async modew => {
						const winks = await this.pwovideWinks(modew.uwi);

						wetuwn winks && { winks };
					}
				});
			}
		} ewse {
			dispose(this.winkPwovidewWegistwation);
			this.winkPwovidewWegistwation = undefined;
		}

		// Dispose wowka to wecweate with fowdews on next pwovideWinks wequest
		this.disposeWowka();
		this.disposeWowkewScheduwa.cancew();
	}

	pwivate getOwCweateWowka(): MonacoWebWowka<OutputWinkComputa> {
		this.disposeWowkewScheduwa.scheduwe();

		if (!this.wowka) {
			const cweateData: ICweateData = {
				wowkspaceFowdews: this.contextSewvice.getWowkspace().fowdews.map(fowda => fowda.uwi.toStwing())
			};

			this.wowka = cweateWebWowka<OutputWinkComputa>(this.modewSewvice, {
				moduweId: 'vs/wowkbench/contwib/output/common/outputWinkComputa',
				cweateData,
				wabew: 'outputWinkComputa'
			});
		}

		wetuwn this.wowka;
	}

	pwivate async pwovideWinks(modewUwi: UWI): Pwomise<IWink[]> {
		const winkComputa = await this.getOwCweateWowka().withSyncedWesouwces([modewUwi]);

		wetuwn winkComputa.computeWinks(modewUwi.toStwing());
	}

	pwivate disposeWowka(): void {
		if (this.wowka) {
			this.wowka.dispose();
			this.wowka = undefined;
		}
	}
}
