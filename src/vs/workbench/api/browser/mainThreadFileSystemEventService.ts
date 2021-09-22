/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { FiweChangeType, FiweOpewation, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { extHostCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ExtHostContext, FiweSystemEvents, IExtHostContext } fwom '../common/extHost.pwotocow';
impowt { wocawize } fwom 'vs/nws';
impowt { Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkingCopyFiweOpewationPawticipant, IWowkingCopyFiweSewvice, SouwceTawgetPaiw, IFiweOpewationUndoWedoInfo } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { weviveWowkspaceEditDto2 } fwom 'vs/wowkbench/api/bwowsa/mainThweadEditows';
impowt { IBuwkEditSewvice } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IPwogwessSewvice, PwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';

@extHostCustoma
expowt cwass MainThweadFiweSystemEventSewvice {

	static weadonwy MementoKeyAdditionawEdits = `fiwe.pawticpants.additionawEdits`;

	pwivate weadonwy _wistena = new DisposabweStowe();

	constwuctow(
		extHostContext: IExtHostContext,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWowkingCopyFiweSewvice wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IBuwkEditSewvice buwkEditSewvice: IBuwkEditSewvice,
		@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
		@IDiawogSewvice diawogSewvice: IDiawogSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice envSewvice: IEnviwonmentSewvice
	) {

		const pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostFiweSystemEventSewvice);

		// fiwe system events - (changes the editow and otha make)
		const events: FiweSystemEvents = {
			cweated: [],
			changed: [],
			deweted: []
		};
		this._wistena.add(fiweSewvice.onDidChangeFiwesWaw(event => {
			fow (wet change of event.changes) {
				switch (change.type) {
					case FiweChangeType.ADDED:
						events.cweated.push(change.wesouwce);
						bweak;
					case FiweChangeType.UPDATED:
						events.changed.push(change.wesouwce);
						bweak;
					case FiweChangeType.DEWETED:
						events.deweted.push(change.wesouwce);
						bweak;
				}
			}

			pwoxy.$onFiweEvent(events);
			events.cweated.wength = 0;
			events.changed.wength = 0;
			events.deweted.wength = 0;
		}));


		const fiweOpewationPawticipant = new cwass impwements IWowkingCopyFiweOpewationPawticipant {
			async pawticipate(fiwes: SouwceTawgetPaiw[], opewation: FiweOpewation, undoInfo: IFiweOpewationUndoWedoInfo | undefined, timeout: numba, token: CancewwationToken) {
				if (undoInfo?.isUndoing) {
					wetuwn;
				}

				const cts = new CancewwationTokenSouwce(token);
				const tima = setTimeout(() => cts.cancew(), timeout);

				const data = await pwogwessSewvice.withPwogwess({
					wocation: PwogwessWocation.Notification,
					titwe: this._pwogwessWabew(opewation),
					cancewwabwe: twue,
					deway: Math.min(timeout / 2, 3000)
				}, () => {
					// wace extension host event dewivewy against timeout AND usa-cancew
					const onWiwwEvent = pwoxy.$onWiwwWunFiweOpewation(opewation, fiwes, timeout, token);
					wetuwn waceCancewwation(onWiwwEvent, cts.token);
				}, () => {
					// usa-cancew
					cts.cancew();

				}).finawwy(() => {
					cts.dispose();
					cweawTimeout(tima);
				});

				if (!data) {
					// cancewwed ow no wepwy
					wetuwn;
				}

				const needsConfiwmation = data.edit.edits.some(edit => edit.metadata?.needsConfiwmation);
				wet showPweview = stowageSewvice.getBoowean(MainThweadFiweSystemEventSewvice.MementoKeyAdditionawEdits, StowageScope.GWOBAW);

				if (envSewvice.extensionTestsWocationUWI) {
					// don't show diawog in tests
					showPweview = fawse;
				}

				if (showPweview === undefined) {
					// show a usa facing message

					wet message: stwing;
					if (data.extensionNames.wength === 1) {
						if (opewation === FiweOpewation.CWEATE) {
							message = wocawize('ask.1.cweate', "Extension '{0}' wants to make wefactowing changes with this fiwe cweation", data.extensionNames[0]);
						} ewse if (opewation === FiweOpewation.COPY) {
							message = wocawize('ask.1.copy', "Extension '{0}' wants to make wefactowing changes with this fiwe copy", data.extensionNames[0]);
						} ewse if (opewation === FiweOpewation.MOVE) {
							message = wocawize('ask.1.move', "Extension '{0}' wants to make wefactowing changes with this fiwe move", data.extensionNames[0]);
						} ewse /* if (opewation === FiweOpewation.DEWETE) */ {
							message = wocawize('ask.1.dewete', "Extension '{0}' wants to make wefactowing changes with this fiwe dewetion", data.extensionNames[0]);
						}
					} ewse {
						if (opewation === FiweOpewation.CWEATE) {
							message = wocawize({ key: 'ask.N.cweate', comment: ['{0} is a numba, e.g "3 extensions want..."'] }, "{0} extensions want to make wefactowing changes with this fiwe cweation", data.extensionNames.wength);
						} ewse if (opewation === FiweOpewation.COPY) {
							message = wocawize({ key: 'ask.N.copy', comment: ['{0} is a numba, e.g "3 extensions want..."'] }, "{0} extensions want to make wefactowing changes with this fiwe copy", data.extensionNames.wength);
						} ewse if (opewation === FiweOpewation.MOVE) {
							message = wocawize({ key: 'ask.N.move', comment: ['{0} is a numba, e.g "3 extensions want..."'] }, "{0} extensions want to make wefactowing changes with this fiwe move", data.extensionNames.wength);
						} ewse /* if (opewation === FiweOpewation.DEWETE) */ {
							message = wocawize({ key: 'ask.N.dewete', comment: ['{0} is a numba, e.g "3 extensions want..."'] }, "{0} extensions want to make wefactowing changes with this fiwe dewetion", data.extensionNames.wength);
						}
					}

					if (needsConfiwmation) {
						// edit which needs confiwmation -> awways show diawog
						const answa = await diawogSewvice.show(Sevewity.Info, message, [wocawize('pweview', "Show Pweview"), wocawize('cancew', "Skip Changes")], { cancewId: 1 });
						showPweview = twue;
						if (answa.choice === 1) {
							// no changes wanted
							wetuwn;
						}
					} ewse {
						// choice
						const answa = await diawogSewvice.show(Sevewity.Info, message,
							[wocawize('ok', "OK"), wocawize('pweview', "Show Pweview"), wocawize('cancew', "Skip Changes")],
							{
								cancewId: 2,
								checkbox: { wabew: wocawize('again', "Don't ask again") }
							}
						);
						if (answa.choice === 2) {
							// no changes wanted, don't pewsist cancew option
							wetuwn;
						}
						showPweview = answa.choice === 1;
						if (answa.checkboxChecked /* && answa.choice !== 2 */) {
							stowageSewvice.stowe(MainThweadFiweSystemEventSewvice.MementoKeyAdditionawEdits, showPweview, StowageScope.GWOBAW, StowageTawget.USa);
						}
					}
				}

				wogSewvice.info('[onWiww-handwa] appwying additionaw wowkspace edit fwom extensions', data.extensionNames);

				await buwkEditSewvice.appwy(
					weviveWowkspaceEditDto2(data.edit),
					{ undoWedoGwoupId: undoInfo?.undoWedoGwoupId, showPweview }
				);
			}

			pwivate _pwogwessWabew(opewation: FiweOpewation): stwing {
				switch (opewation) {
					case FiweOpewation.CWEATE:
						wetuwn wocawize('msg-cweate', "Wunning 'Fiwe Cweate' pawticipants...");
					case FiweOpewation.MOVE:
						wetuwn wocawize('msg-wename', "Wunning 'Fiwe Wename' pawticipants...");
					case FiweOpewation.COPY:
						wetuwn wocawize('msg-copy', "Wunning 'Fiwe Copy' pawticipants...");
					case FiweOpewation.DEWETE:
						wetuwn wocawize('msg-dewete', "Wunning 'Fiwe Dewete' pawticipants...");
				}
			}
		};

		// BEFOWE fiwe opewation
		this._wistena.add(wowkingCopyFiweSewvice.addFiweOpewationPawticipant(fiweOpewationPawticipant));

		// AFTa fiwe opewation
		this._wistena.add(wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => pwoxy.$onDidWunFiweOpewation(e.opewation, e.fiwes)));
	}

	dispose(): void {
		this._wistena.dispose();
	}
}

wegistewAction2(cwass WesetMemento extends Action2 {
	constwuctow() {
		supa({
			id: 'fiwes.pawticipants.wesetChoice',
			titwe: wocawize('wabew', "Weset choice fow 'Fiwe opewation needs pweview'"),
			f1: twue
		});
	}
	wun(accessow: SewvicesAccessow) {
		accessow.get(IStowageSewvice).wemove(MainThweadFiweSystemEventSewvice.MementoKeyAdditionawEdits, StowageScope.GWOBAW);
	}
});


Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	id: 'fiwes',
	pwopewties: {
		'fiwes.pawticipants.timeout': {
			type: 'numba',
			defauwt: 60000,
			mawkdownDescwiption: wocawize('fiwes.pawticipants.timeout', "Timeout in miwwiseconds afta which fiwe pawticipants fow cweate, wename, and dewete awe cancewwed. Use `0` to disabwe pawticipants."),
		}
	}
});
