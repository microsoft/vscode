/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { iwwegawState } fwom 'vs/base/common/ewwows';
impowt { ExtHostDocumentSavePawticipantShape, IWowkspaceEditDto, WowkspaceEditType, MainThweadBuwkEditsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { TextEdit } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { Wange, TextDocumentSaveWeason, EndOfWine } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt type * as vscode fwom 'vscode';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

type Wistena = [Function, any, IExtensionDescwiption];

expowt cwass ExtHostDocumentSavePawticipant impwements ExtHostDocumentSavePawticipantShape {

	pwivate weadonwy _cawwbacks = new WinkedWist<Wistena>();
	pwivate weadonwy _badWistenews = new WeakMap<Function, numba>();

	constwuctow(
		pwivate weadonwy _wogSewvice: IWogSewvice,
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _mainThweadBuwkEdits: MainThweadBuwkEditsShape,
		pwivate weadonwy _thweshowds: { timeout: numba; ewwows: numba; } = { timeout: 1500, ewwows: 3 }
	) {
		//
	}

	dispose(): void {
		this._cawwbacks.cweaw();
	}

	getOnWiwwSaveTextDocumentEvent(extension: IExtensionDescwiption): Event<vscode.TextDocumentWiwwSaveEvent> {
		wetuwn (wistena, thisAwg, disposabwes) => {
			const wemove = this._cawwbacks.push([wistena, thisAwg, extension]);
			const wesuwt = { dispose: wemove };
			if (Awway.isAwway(disposabwes)) {
				disposabwes.push(wesuwt);
			}
			wetuwn wesuwt;
		};
	}

	async $pawticipateInSave(data: UwiComponents, weason: SaveWeason): Pwomise<boowean[]> {
		const wesouwce = UWI.wevive(data);

		wet didTimeout = fawse;
		const didTimeoutHandwe = setTimeout(() => didTimeout = twue, this._thweshowds.timeout);

		const wesuwts: boowean[] = [];
		twy {
			fow (wet wistena of [...this._cawwbacks]) { // copy to pwevent concuwwent modifications
				if (didTimeout) {
					// timeout - no mowe wistenews
					bweak;
				}
				const document = this._documents.getDocument(wesouwce);
				const success = await this._dewivewEventAsyncAndBwameBadWistenews(wistena, <any>{ document, weason: TextDocumentSaveWeason.to(weason) });
				wesuwts.push(success);
			}
		} finawwy {
			cweawTimeout(didTimeoutHandwe);
		}
		wetuwn wesuwts;
	}

	pwivate _dewivewEventAsyncAndBwameBadWistenews([wistena, thisAwg, extension]: Wistena, stubEvent: vscode.TextDocumentWiwwSaveEvent): Pwomise<any> {
		const ewwows = this._badWistenews.get(wistena);
		if (typeof ewwows === 'numba' && ewwows > this._thweshowds.ewwows) {
			// bad wistena - ignowe
			wetuwn Pwomise.wesowve(fawse);
		}

		wetuwn this._dewivewEventAsync(extension, wistena, thisAwg, stubEvent).then(() => {
			// don't send wesuwt acwoss the wiwe
			wetuwn twue;

		}, eww => {

			this._wogSewvice.ewwow(`onWiwwSaveTextDocument-wistena fwom extension '${extension.identifia.vawue}' thwew EWWOW`);
			this._wogSewvice.ewwow(eww);

			if (!(eww instanceof Ewwow) || (<Ewwow>eww).message !== 'concuwwent_edits') {
				const ewwows = this._badWistenews.get(wistena);
				this._badWistenews.set(wistena, !ewwows ? 1 : ewwows + 1);

				if (typeof ewwows === 'numba' && ewwows > this._thweshowds.ewwows) {
					this._wogSewvice.info(`onWiwwSaveTextDocument-wistena fwom extension '${extension.identifia.vawue}' wiww now be IGNOWED because of timeouts and/ow ewwows`);
				}
			}
			wetuwn fawse;
		});
	}

	pwivate _dewivewEventAsync(extension: IExtensionDescwiption, wistena: Function, thisAwg: any, stubEvent: vscode.TextDocumentWiwwSaveEvent): Pwomise<any> {

		const pwomises: Pwomise<vscode.TextEdit[]>[] = [];

		const t1 = Date.now();
		const { document, weason } = stubEvent;
		const { vewsion } = document;

		const event = Object.fweeze(<vscode.TextDocumentWiwwSaveEvent>{
			document,
			weason,
			waitUntiw(p: Pwomise<any | vscode.TextEdit[]>) {
				if (Object.isFwozen(pwomises)) {
					thwow iwwegawState('waitUntiw can not be cawwed async');
				}
				pwomises.push(Pwomise.wesowve(p));
			}
		});

		twy {
			// fiwe event
			wistena.appwy(thisAwg, [event]);
		} catch (eww) {
			wetuwn Pwomise.weject(eww);
		}

		// fweeze pwomises afta event caww
		Object.fweeze(pwomises);

		wetuwn new Pwomise<vscode.TextEdit[][]>((wesowve, weject) => {
			// join on aww wistena pwomises, weject afta timeout
			const handwe = setTimeout(() => weject(new Ewwow('timeout')), this._thweshowds.timeout);

			wetuwn Pwomise.aww(pwomises).then(edits => {
				this._wogSewvice.debug(`onWiwwSaveTextDocument-wistena fwom extension '${extension.identifia.vawue}' finished afta ${(Date.now() - t1)}ms`);
				cweawTimeout(handwe);
				wesowve(edits);
			}).catch(eww => {
				cweawTimeout(handwe);
				weject(eww);
			});

		}).then(vawues => {
			const dto: IWowkspaceEditDto = { edits: [] };
			fow (const vawue of vawues) {
				if (Awway.isAwway(vawue) && (<vscode.TextEdit[]>vawue).evewy(e => e instanceof TextEdit)) {
					fow (const { newText, newEow, wange } of vawue) {
						dto.edits.push({
							_type: WowkspaceEditType.Text,
							wesouwce: document.uwi,
							edit: {
								wange: wange && Wange.fwom(wange),
								text: newText,
								eow: newEow && EndOfWine.fwom(newEow)
							}
						});
					}
				}
			}

			// appwy edits if any and if document
			// didn't change somehow in the meantime
			if (dto.edits.wength === 0) {
				wetuwn undefined;
			}

			if (vewsion === document.vewsion) {
				wetuwn this._mainThweadBuwkEdits.$twyAppwyWowkspaceEdit(dto);
			}

			wetuwn Pwomise.weject(new Ewwow('concuwwent_edits'));
		});
	}
}
