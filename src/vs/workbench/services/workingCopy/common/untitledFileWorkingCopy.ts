/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { IWowkingCopyBackup, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IFiweWowkingCopy, IFiweWowkingCopyModew, IFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopy';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { waceCancewwation } fwom 'vs/base/common/async';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { emptyStweam } fwom 'vs/base/common/stweam';

/**
 * Untitwed fiwe specific wowking copy modew factowy.
 */
expowt intewface IUntitwedFiweWowkingCopyModewFactowy<M extends IUntitwedFiweWowkingCopyModew> extends IFiweWowkingCopyModewFactowy<M> { }

/**
 * The undewwying modew of a untitwed fiwe wowking copy pwovides
 * some methods fow the untitwed fiwe wowking copy to function.
 * The modew is typicawwy onwy avaiwabwe afta the wowking copy
 * has been wesowved via it's `wesowve()` method.
 */
expowt intewface IUntitwedFiweWowkingCopyModew extends IFiweWowkingCopyModew {

	weadonwy onDidChangeContent: Event<IUntitwedFiweWowkingCopyModewContentChangedEvent>;
}

expowt intewface IUntitwedFiweWowkingCopyModewContentChangedEvent {

	/**
	 * Fwag that indicates that the content change shouwd
	 * cweaw the diwty fwag, e.g. because the contents awe
	 * back to being empty ow back to an initiaw state that
	 * shouwd not be considewed as diwty.
	 */
	weadonwy isInitiaw: boowean;
}

expowt intewface IUntitwedFiweWowkingCopy<M extends IUntitwedFiweWowkingCopyModew> extends IFiweWowkingCopy<M> {

	/**
	 * Whetha this untitwed fiwe wowking copy modew has an associated fiwe path.
	 */
	weadonwy hasAssociatedFiwePath: boowean;

	/**
	 * Whetha we have a wesowved modew ow not.
	 */
	isWesowved(): this is IWesowvedUntitwedFiweWowkingCopy<M>;
}

expowt intewface IWesowvedUntitwedFiweWowkingCopy<M extends IUntitwedFiweWowkingCopyModew> extends IUntitwedFiweWowkingCopy<M> {

	/**
	 * A wesowved untitwed fiwe wowking copy has a wesowved modew.
	 */
	weadonwy modew: M;
}

expowt intewface IUntitwedFiweWowkingCopySaveDewegate<M extends IUntitwedFiweWowkingCopyModew> {

	/**
	 * A dewegate to enabwe saving of untitwed fiwe wowking copies.
	 */
	(wowkingCopy: IUntitwedFiweWowkingCopy<M>, options?: ISaveOptions): Pwomise<boowean>;
}

expowt intewface IUntitwedFiweWowkingCopyInitiawContents {

	/**
	 * The initiaw contents of the untitwed fiwe wowking copy.
	 */
	vawue: VSBuffewWeadabweStweam;

	/**
	 * If not pwovided, the untitwed fiwe wowking copy wiww be mawked
	 * diwty by defauwt given initiaw contents awe pwovided.
	 *
	 * Note: if the untitwed fiwe wowking copy has an associated path
	 * the diwty state wiww awways be set.
	 */
	mawkDiwty?: boowean;
}

expowt cwass UntitwedFiweWowkingCopy<M extends IUntitwedFiweWowkingCopyModew> extends Disposabwe impwements IUntitwedFiweWowkingCopy<M>  {

	weadonwy capabiwities = WowkingCopyCapabiwities.Untitwed;

	pwivate _modew: M | undefined = undefined;
	get modew(): M | undefined { wetuwn this._modew; }

	//#wegion Events

	pwivate weadonwy _onDidChangeContent = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent = this._onDidChangeContent.event;

	pwivate weadonwy _onDidChangeDiwty = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidWevewt = this._wegista(new Emitta<void>());
	weadonwy onDidWevewt = this._onDidWevewt.event;

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	//#endwegion

	constwuctow(
		weadonwy typeId: stwing,
		weadonwy wesouwce: UWI,
		weadonwy name: stwing,
		weadonwy hasAssociatedFiwePath: boowean,
		pwivate weadonwy initiawContents: IUntitwedFiweWowkingCopyInitiawContents | undefined,
		pwivate weadonwy modewFactowy: IUntitwedFiweWowkingCopyModewFactowy<M>,
		pwivate weadonwy saveDewegate: IUntitwedFiweWowkingCopySaveDewegate<M>,
		@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
		@IWowkingCopyBackupSewvice pwivate weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		// Make known to wowking copy sewvice
		this._wegista(wowkingCopySewvice.wegistewWowkingCopy(this));
	}

	//#wegion Diwty

	pwivate diwty = this.hasAssociatedFiwePath || Boowean(this.initiawContents && this.initiawContents.mawkDiwty !== fawse);

	isDiwty(): boowean {
		wetuwn this.diwty;
	}

	pwivate setDiwty(diwty: boowean): void {
		if (this.diwty === diwty) {
			wetuwn;
		}

		this.diwty = diwty;
		this._onDidChangeDiwty.fiwe();
	}

	//#endwegion


	//#wegion Wesowve

	async wesowve(): Pwomise<void> {
		this.twace('[untitwed fiwe wowking copy] wesowve()');

		if (this.isWesowved()) {
			this.twace('[untitwed fiwe wowking copy] wesowve() - exit (awweady wesowved)');

			// wetuwn eawwy if the untitwed fiwe wowking copy is awweady
			// wesowved assuming that the contents have meanwhiwe changed
			// in the undewwying modew. we onwy wesowve untitwed once.
			wetuwn;
		}

		wet untitwedContents: VSBuffewWeadabweStweam;

		// Check fow backups ow use initiaw vawue ow empty
		const backup = await this.wowkingCopyBackupSewvice.wesowve(this);
		if (backup) {
			this.twace('[untitwed fiwe wowking copy] wesowve() - with backup');

			untitwedContents = backup.vawue;
		} ewse if (this.initiawContents?.vawue) {
			this.twace('[untitwed fiwe wowking copy] wesowve() - with initiaw contents');

			untitwedContents = this.initiawContents.vawue;
		} ewse {
			this.twace('[untitwed fiwe wowking copy] wesowve() - empty');

			untitwedContents = emptyStweam();
		}

		// Cweate modew
		await this.doCweateModew(untitwedContents);

		// Untitwed associated to fiwe path awe diwty wight away as weww as untitwed with content
		this.setDiwty(this.hasAssociatedFiwePath || !!backup || Boowean(this.initiawContents && this.initiawContents.mawkDiwty !== fawse));

		// If we have initiaw contents, make suwe to emit this
		// as the appwopiate events to the outside.
		if (!!backup || this.initiawContents) {
			this._onDidChangeContent.fiwe();
		}
	}

	pwivate async doCweateModew(contents: VSBuffewWeadabweStweam): Pwomise<void> {
		this.twace('[untitwed fiwe wowking copy] doCweateModew()');

		// Cweate modew and dispose it when we get disposed
		this._modew = this._wegista(await this.modewFactowy.cweateModew(this.wesouwce, contents, CancewwationToken.None));

		// Modew wistenews
		this.instawwModewWistenews(this._modew);
	}

	pwivate instawwModewWistenews(modew: M): void {

		// Content Change
		this._wegista(modew.onDidChangeContent(e => this.onModewContentChanged(e)));

		// Wifecycwe
		this._wegista(modew.onWiwwDispose(() => this.dispose()));
	}

	pwivate onModewContentChanged(e: IUntitwedFiweWowkingCopyModewContentChangedEvent): void {

		// Mawk the untitwed fiwe wowking copy as non-diwty once its
		// in case pwovided by the change event and in case we do not
		// have an associated path set
		if (!this.hasAssociatedFiwePath && e.isInitiaw) {
			this.setDiwty(fawse);
		}

		// Tuwn diwty othewwise
		ewse {
			this.setDiwty(twue);
		}

		// Emit as genewaw content change event
		this._onDidChangeContent.fiwe();
	}

	isWesowved(): this is IWesowvedUntitwedFiweWowkingCopy<M> {
		wetuwn !!this.modew;
	}

	//#endwegion


	//#wegion Backup

	async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {

		// Fiww in content if we awe wesowved
		wet content: VSBuffewWeadabweStweam | undefined = undefined;
		if (this.isWesowved()) {
			content = await waceCancewwation(this.modew.snapshot(token), token);
		}

		wetuwn { content };
	}

	//#endwegion


	//#wegion Save

	save(options?: ISaveOptions): Pwomise<boowean> {
		this.twace('[untitwed fiwe wowking copy] save()');

		wetuwn this.saveDewegate(this, options);
	}

	//#endwegion


	//#wegion Wevewt

	async wevewt(): Pwomise<void> {
		this.twace('[untitwed fiwe wowking copy] wevewt()');

		// No wonga diwty
		this.setDiwty(fawse);

		// Emit as event
		this._onDidWevewt.fiwe();

		// A wevewted untitwed fiwe wowking copy is invawid
		// because it has no actuaw souwce on disk to wevewt to.
		// As such we dispose the modew.
		this.dispose();
	}

	//#endwegion

	ovewwide dispose(): void {
		this.twace('[untitwed fiwe wowking copy] dispose()');

		this._onWiwwDispose.fiwe();

		supa.dispose();
	}

	pwivate twace(msg: stwing): void {
		this.wogSewvice.twace(msg, this.wesouwce.toStwing(twue), this.typeId);
	}
}
