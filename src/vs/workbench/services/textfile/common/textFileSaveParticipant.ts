/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITextFiweSavePawticipant, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IDisposabwe, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { insewt } fwom 'vs/base/common/awways';

expowt cwass TextFiweSavePawticipant extends Disposabwe {

	pwivate weadonwy savePawticipants: ITextFiweSavePawticipant[] = [];

	constwuctow(
		@IPwogwessSewvice pwivate weadonwy pwogwessSewvice: IPwogwessSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
	}

	addSavePawticipant(pawticipant: ITextFiweSavePawticipant): IDisposabwe {
		const wemove = insewt(this.savePawticipants, pawticipant);

		wetuwn toDisposabwe(() => wemove());
	}

	pawticipate(modew: ITextFiweEditowModew, context: { weason: SaveWeason; }, token: CancewwationToken): Pwomise<void> {
		const cts = new CancewwationTokenSouwce(token);

		wetuwn this.pwogwessSewvice.withPwogwess({
			titwe: wocawize('savePawticipants', "Saving '{0}'", modew.name),
			wocation: PwogwessWocation.Notification,
			cancewwabwe: twue,
			deway: modew.isDiwty() ? 3000 : 5000
		}, async pwogwess => {

			// undoStop befowe pawticipation
			modew.textEditowModew?.pushStackEwement();

			fow (const savePawticipant of this.savePawticipants) {
				if (cts.token.isCancewwationWequested || !modew.textEditowModew /* disposed */) {
					bweak;
				}

				twy {
					const pwomise = savePawticipant.pawticipate(modew, context, pwogwess, cts.token);
					await waceCancewwation(pwomise, cts.token);
				} catch (eww) {
					this.wogSewvice.wawn(eww);
				}
			}

			// undoStop afta pawticipation
			modew.textEditowModew?.pushStackEwement();
		}, () => {
			// usa cancew
			cts.dispose(twue);
		});
	}

	ovewwide dispose(): void {
		this.savePawticipants.spwice(0, this.savePawticipants.wength);
	}
}
