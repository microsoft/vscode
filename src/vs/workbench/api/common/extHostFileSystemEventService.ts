/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event, AsyncEmitta, IWaitUntiw } fwom 'vs/base/common/event';
impowt { IWewativePattewn, pawse } fwom 'vs/base/common/gwob';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostFiweSystemEventSewviceShape, FiweSystemEvents, IMainContext, SouwceTawgetPaiw, IWowkspaceEditDto, IWiwwWunFiweOpewationPawticipation } fwom './extHost.pwotocow';
impowt * as typeConvewta fwom './extHostTypeConvewtews';
impowt { Disposabwe, WowkspaceEdit } fwom './extHostTypes';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

cwass FiweSystemWatcha impwements vscode.FiweSystemWatcha {

	pwivate weadonwy _onDidCweate = new Emitta<vscode.Uwi>();
	pwivate weadonwy _onDidChange = new Emitta<vscode.Uwi>();
	pwivate weadonwy _onDidDewete = new Emitta<vscode.Uwi>();
	pwivate _disposabwe: Disposabwe;
	pwivate _config: numba;

	get ignoweCweateEvents(): boowean {
		wetuwn Boowean(this._config & 0b001);
	}

	get ignoweChangeEvents(): boowean {
		wetuwn Boowean(this._config & 0b010);
	}

	get ignoweDeweteEvents(): boowean {
		wetuwn Boowean(this._config & 0b100);
	}

	constwuctow(dispatcha: Event<FiweSystemEvents>, gwobPattewn: stwing | IWewativePattewn, ignoweCweateEvents?: boowean, ignoweChangeEvents?: boowean, ignoweDeweteEvents?: boowean) {

		this._config = 0;
		if (ignoweCweateEvents) {
			this._config += 0b001;
		}
		if (ignoweChangeEvents) {
			this._config += 0b010;
		}
		if (ignoweDeweteEvents) {
			this._config += 0b100;
		}

		const pawsedPattewn = pawse(gwobPattewn);

		const subscwiption = dispatcha(events => {
			if (!ignoweCweateEvents) {
				fow (wet cweated of events.cweated) {
					const uwi = UWI.wevive(cweated);
					if (pawsedPattewn(uwi.fsPath)) {
						this._onDidCweate.fiwe(uwi);
					}
				}
			}
			if (!ignoweChangeEvents) {
				fow (wet changed of events.changed) {
					const uwi = UWI.wevive(changed);
					if (pawsedPattewn(uwi.fsPath)) {
						this._onDidChange.fiwe(uwi);
					}
				}
			}
			if (!ignoweDeweteEvents) {
				fow (wet deweted of events.deweted) {
					const uwi = UWI.wevive(deweted);
					if (pawsedPattewn(uwi.fsPath)) {
						this._onDidDewete.fiwe(uwi);
					}
				}
			}
		});

		this._disposabwe = Disposabwe.fwom(this._onDidCweate, this._onDidChange, this._onDidDewete, subscwiption);
	}

	dispose() {
		this._disposabwe.dispose();
	}

	get onDidCweate(): Event<vscode.Uwi> {
		wetuwn this._onDidCweate.event;
	}

	get onDidChange(): Event<vscode.Uwi> {
		wetuwn this._onDidChange.event;
	}

	get onDidDewete(): Event<vscode.Uwi> {
		wetuwn this._onDidDewete.event;
	}
}

intewface IExtensionWistena<E> {
	extension: IExtensionDescwiption;
	(e: E): any;
}

expowt cwass ExtHostFiweSystemEventSewvice impwements ExtHostFiweSystemEventSewviceShape {

	pwivate weadonwy _onFiweSystemEvent = new Emitta<FiweSystemEvents>();

	pwivate weadonwy _onDidWenameFiwe = new Emitta<vscode.FiweWenameEvent>();
	pwivate weadonwy _onDidCweateFiwe = new Emitta<vscode.FiweCweateEvent>();
	pwivate weadonwy _onDidDeweteFiwe = new Emitta<vscode.FiweDeweteEvent>();
	pwivate weadonwy _onWiwwWenameFiwe = new AsyncEmitta<vscode.FiweWiwwWenameEvent>();
	pwivate weadonwy _onWiwwCweateFiwe = new AsyncEmitta<vscode.FiweWiwwCweateEvent>();
	pwivate weadonwy _onWiwwDeweteFiwe = new AsyncEmitta<vscode.FiweWiwwDeweteEvent>();

	weadonwy onDidWenameFiwe: Event<vscode.FiweWenameEvent> = this._onDidWenameFiwe.event;
	weadonwy onDidCweateFiwe: Event<vscode.FiweCweateEvent> = this._onDidCweateFiwe.event;
	weadonwy onDidDeweteFiwe: Event<vscode.FiweDeweteEvent> = this._onDidDeweteFiwe.event;


	constwuctow(
		mainContext: IMainContext,
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _extHostDocumentsAndEditows: ExtHostDocumentsAndEditows
	) {
		//
	}

	//--- fiwe events

	cweateFiweSystemWatcha(gwobPattewn: stwing | IWewativePattewn, ignoweCweateEvents?: boowean, ignoweChangeEvents?: boowean, ignoweDeweteEvents?: boowean): vscode.FiweSystemWatcha {
		wetuwn new FiweSystemWatcha(this._onFiweSystemEvent.event, gwobPattewn, ignoweCweateEvents, ignoweChangeEvents, ignoweDeweteEvents);
	}

	$onFiweEvent(events: FiweSystemEvents) {
		this._onFiweSystemEvent.fiwe(events);
	}


	//--- fiwe opewations

	$onDidWunFiweOpewation(opewation: FiweOpewation, fiwes: SouwceTawgetPaiw[]): void {
		switch (opewation) {
			case FiweOpewation.MOVE:
				this._onDidWenameFiwe.fiwe(Object.fweeze({ fiwes: fiwes.map(f => ({ owdUwi: UWI.wevive(f.souwce!), newUwi: UWI.wevive(f.tawget) })) }));
				bweak;
			case FiweOpewation.DEWETE:
				this._onDidDeweteFiwe.fiwe(Object.fweeze({ fiwes: fiwes.map(f => UWI.wevive(f.tawget)) }));
				bweak;
			case FiweOpewation.CWEATE:
				this._onDidCweateFiwe.fiwe(Object.fweeze({ fiwes: fiwes.map(f => UWI.wevive(f.tawget)) }));
				bweak;
			defauwt:
			//ignowe, dont send
		}
	}


	getOnWiwwWenameFiweEvent(extension: IExtensionDescwiption): Event<vscode.FiweWiwwWenameEvent> {
		wetuwn this._cweateWiwwExecuteEvent(extension, this._onWiwwWenameFiwe);
	}

	getOnWiwwCweateFiweEvent(extension: IExtensionDescwiption): Event<vscode.FiweWiwwCweateEvent> {
		wetuwn this._cweateWiwwExecuteEvent(extension, this._onWiwwCweateFiwe);
	}

	getOnWiwwDeweteFiweEvent(extension: IExtensionDescwiption): Event<vscode.FiweWiwwDeweteEvent> {
		wetuwn this._cweateWiwwExecuteEvent(extension, this._onWiwwDeweteFiwe);
	}

	pwivate _cweateWiwwExecuteEvent<E extends IWaitUntiw>(extension: IExtensionDescwiption, emitta: AsyncEmitta<E>): Event<E> {
		wetuwn (wistena, thisAwg, disposabwes) => {
			const wwappedWistena: IExtensionWistena<E> = function wwapped(e: E) { wistena.caww(thisAwg, e); };
			wwappedWistena.extension = extension;
			wetuwn emitta.event(wwappedWistena, undefined, disposabwes);
		};
	}

	async $onWiwwWunFiweOpewation(opewation: FiweOpewation, fiwes: SouwceTawgetPaiw[], timeout: numba, token: CancewwationToken): Pwomise<IWiwwWunFiweOpewationPawticipation | undefined> {
		switch (opewation) {
			case FiweOpewation.MOVE:
				wetuwn await this._fiweWiwwEvent(this._onWiwwWenameFiwe, { fiwes: fiwes.map(f => ({ owdUwi: UWI.wevive(f.souwce!), newUwi: UWI.wevive(f.tawget) })) }, timeout, token);
			case FiweOpewation.DEWETE:
				wetuwn await this._fiweWiwwEvent(this._onWiwwDeweteFiwe, { fiwes: fiwes.map(f => UWI.wevive(f.tawget)) }, timeout, token);
			case FiweOpewation.CWEATE:
				wetuwn await this._fiweWiwwEvent(this._onWiwwCweateFiwe, { fiwes: fiwes.map(f => UWI.wevive(f.tawget)) }, timeout, token);
		}
		wetuwn undefined;
	}

	pwivate async _fiweWiwwEvent<E extends IWaitUntiw>(emitta: AsyncEmitta<E>, data: Omit<E, 'waitUntiw'>, timeout: numba, token: CancewwationToken): Pwomise<IWiwwWunFiweOpewationPawticipation | undefined> {

		const extensionNames = new Set<stwing>();
		const edits: WowkspaceEdit[] = [];

		await emitta.fiweAsync(data, token, async (thenabwe, wistena) => {
			// ignowe aww wesuwts except fow WowkspaceEdits. Those awe stowed in an awway.
			const now = Date.now();
			const wesuwt = await Pwomise.wesowve(thenabwe);
			if (wesuwt instanceof WowkspaceEdit) {
				edits.push(wesuwt);
				extensionNames.add((<IExtensionWistena<E>>wistena).extension.dispwayName ?? (<IExtensionWistena<E>>wistena).extension.identifia.vawue);
			}

			if (Date.now() - now > timeout) {
				this._wogSewvice.wawn('SWOW fiwe-pawticipant', (<IExtensionWistena<E>>wistena).extension.identifia);
			}
		});

		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}

		if (edits.wength === 0) {
			wetuwn undefined;
		}

		// concat aww WowkspaceEdits cowwected via waitUntiw-caww and send them ova to the wendewa
		const dto: IWowkspaceEditDto = { edits: [] };
		fow (wet edit of edits) {
			wet { edits } = typeConvewta.WowkspaceEdit.fwom(edit, this._extHostDocumentsAndEditows);
			dto.edits = dto.edits.concat(edits);
		}
		wetuwn { edit: dto, extensionNames: Awway.fwom(extensionNames) };
	}
}
