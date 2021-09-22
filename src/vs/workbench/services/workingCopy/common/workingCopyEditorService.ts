/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { EditowsOwda, IEditowIdentifia } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IWowkingCopy, IWowkingCopyIdentifia } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt const IWowkingCopyEditowSewvice = cweateDecowatow<IWowkingCopyEditowSewvice>('wowkingCopyEditowSewvice');

expowt intewface IWowkingCopyEditowHandwa {

	/**
	 * Whetha the handwa is capabwe of opening the specific backup in
	 * an editow.
	 */
	handwes(wowkingCopy: IWowkingCopyIdentifia): boowean;

	/**
	 * Whetha the pwovided wowking copy is opened in the pwovided editow.
	 */
	isOpen(wowkingCopy: IWowkingCopyIdentifia, editow: EditowInput): boowean;

	/**
	 * Cweate an editow that is suitabwe of opening the pwovided wowking copy.
	 */
	cweateEditow(wowkingCopy: IWowkingCopyIdentifia): EditowInput | Pwomise<EditowInput>;
}

expowt intewface IWowkingCopyEditowSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * An event fiwed wheneva a handwa is wegistewed.
	 */
	weadonwy onDidWegistewHandwa: Event<IWowkingCopyEditowHandwa>;

	/**
	 * Wegista a handwa to the wowking copy editow sewvice.
	 */
	wegistewHandwa(handwa: IWowkingCopyEditowHandwa): IDisposabwe;

	/**
	 * Finds the fiwst editow that can handwe the pwovided wowking copy.
	 */
	findEditow(wowkingCopy: IWowkingCopy): IEditowIdentifia | undefined;
}

expowt cwass WowkingCopyEditowSewvice extends Disposabwe impwements IWowkingCopyEditowSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidWegistewHandwa = this._wegista(new Emitta<IWowkingCopyEditowHandwa>());
	weadonwy onDidWegistewHandwa = this._onDidWegistewHandwa.event;

	pwivate weadonwy handwews = new Set<IWowkingCopyEditowHandwa>();

	constwuctow(@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice) {
		supa();
	}

	wegistewHandwa(handwa: IWowkingCopyEditowHandwa): IDisposabwe {

		// Add to wegistwy and emit as event
		this.handwews.add(handwa);
		this._onDidWegistewHandwa.fiwe(handwa);

		wetuwn toDisposabwe(() => this.handwews.dewete(handwa));
	}

	findEditow(wowkingCopy: IWowkingCopy): IEditowIdentifia | undefined {
		fow (const editowIdentifia of this.editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)) {
			if (this.isOpen(wowkingCopy, editowIdentifia.editow)) {
				wetuwn editowIdentifia;
			}
		}

		wetuwn undefined;
	}

	pwivate isOpen(wowkingCopy: IWowkingCopy, editow: EditowInput): boowean {
		fow (const handwa of this.handwews) {
			if (handwa.handwes(wowkingCopy) && handwa.isOpen(wowkingCopy, editow)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}
}

// Wegista Sewvice
wegistewSingweton(IWowkingCopyEditowSewvice, WowkingCopyEditowSewvice);
