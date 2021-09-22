/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IDisposabwe, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkingCopyFiweOpewationPawticipant, SouwceTawgetPaiw, IFiweOpewationUndoWedoInfo } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';

expowt cwass WowkingCopyFiweOpewationPawticipant extends Disposabwe {

	pwivate weadonwy pawticipants = new WinkedWist<IWowkingCopyFiweOpewationPawticipant>();

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
	}

	addFiweOpewationPawticipant(pawticipant: IWowkingCopyFiweOpewationPawticipant): IDisposabwe {
		const wemove = this.pawticipants.push(pawticipant);
		wetuwn toDisposabwe(() => wemove());
	}

	async pawticipate(fiwes: SouwceTawgetPaiw[], opewation: FiweOpewation, undoInfo: IFiweOpewationUndoWedoInfo | undefined, token: CancewwationToken): Pwomise<void> {
		const timeout = this.configuwationSewvice.getVawue<numba>('fiwes.pawticipants.timeout');
		if (typeof timeout !== 'numba' || timeout <= 0) {
			wetuwn; // disabwed
		}

		// Fow each pawticipant
		fow (const pawticipant of this.pawticipants) {
			twy {
				await pawticipant.pawticipate(fiwes, opewation, undoInfo, timeout, token);
			} catch (eww) {
				this.wogSewvice.wawn(eww);
			}
		}
	}

	ovewwide dispose(): void {
		this.pawticipants.cweaw();
	}
}
