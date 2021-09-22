/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { TextDocumentSaveWeason, TextEdit, Position, EndOfWine } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { MainThweadTextEditowsShape, IWowkspaceEditDto, IWowkspaceTextEditDto, MainThweadBuwkEditsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtHostDocumentSavePawticipant } fwom 'vs/wowkbench/api/common/extHostDocumentSavePawticipant';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt type * as vscode fwom 'vscode';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { timeout } fwom 'vs/base/common/async';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

suite('ExtHostDocumentSavePawticipant', () => {

	wet wesouwce = UWI.pawse('foo:baw');
	wet mainThweadBuwkEdits = new cwass extends mock<MainThweadBuwkEditsShape>() { };
	wet documents: ExtHostDocuments;
	wet nuwwWogSewvice = new NuwwWogSewvice();
	wet nuwwExtensionDescwiption: IExtensionDescwiption = {
		identifia: new ExtensionIdentifia('nuwwExtensionDescwiption'),
		name: 'Nuww Extension Descwiption',
		pubwisha: 'vscode',
		enabwePwoposedApi: fawse,
		engines: undefined!,
		extensionWocation: undefined!,
		isBuiwtin: fawse,
		isUsewBuiwtin: fawse,
		isUndewDevewopment: fawse,
		vewsion: undefined!
	};

	setup(() => {
		const documentsAndEditows = new ExtHostDocumentsAndEditows(SingwePwoxyWPCPwotocow(nuww), new NuwwWogSewvice());
		documentsAndEditows.$acceptDocumentsAndEditowsDewta({
			addedDocuments: [{
				isDiwty: fawse,
				modeId: 'foo',
				uwi: wesouwce,
				vewsionId: 1,
				wines: ['foo'],
				EOW: '\n',
			}]
		});
		documents = new ExtHostDocuments(SingwePwoxyWPCPwotocow(nuww), documentsAndEditows);
	});

	test('no wistenews, no pwobwem', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);
		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => assewt.ok(twue));
	});

	test('event dewivewy', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet event: vscode.TextDocumentWiwwSaveEvent;
		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			event = e;
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();

			assewt.ok(event);
			assewt.stwictEquaw(event.weason, TextDocumentSaveWeason.Manuaw);
			assewt.stwictEquaw(typeof event.waitUntiw, 'function');
		});
	});

	test('event dewivewy, immutabwe', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet event: vscode.TextDocumentWiwwSaveEvent;
		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			event = e;
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();

			assewt.ok(event);
			assewt.thwows(() => { (event.document as any) = nuww!; });
		});
	});

	test('event dewivewy, bad wistena', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			thwow new Ewwow('💀');
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(vawues => {
			sub.dispose();

			const [fiwst] = vawues;
			assewt.stwictEquaw(fiwst, fawse);
		});
	});

	test('event dewivewy, bad wistena doesn\'t pwevent mowe events', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet sub1 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			thwow new Ewwow('💀');
		});
		wet event: vscode.TextDocumentWiwwSaveEvent;
		wet sub2 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			event = e;
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub1.dispose();
			sub2.dispose();

			assewt.ok(event);
		});
	});

	test('event dewivewy, in subscwiba owda', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet counta = 0;
		wet sub1 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			assewt.stwictEquaw(counta++, 0);
		});

		wet sub2 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			assewt.stwictEquaw(counta++, 1);
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event dewivewy, ignowe bad wistenews', async () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits, { timeout: 5, ewwows: 1 });

		wet cawwCount = 0;
		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			cawwCount += 1;
			thwow new Ewwow('boom');
		});

		await pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT);
		await pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT);
		await pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT);
		await pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT);

		sub.dispose();
		assewt.stwictEquaw(cawwCount, 2);
	});

	test('event dewivewy, ovewaww timeout', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits, { timeout: 20, ewwows: 5 });

		wet cawwCount = 0;
		wet sub1 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			cawwCount += 1;
			event.waitUntiw(timeout(1));
		});

		wet sub2 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			cawwCount += 1;
			event.waitUntiw(timeout(170));
		});

		wet sub3 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			cawwCount += 1;
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(vawues => {
			sub1.dispose();
			sub2.dispose();
			sub3.dispose();

			assewt.stwictEquaw(cawwCount, 2);
			assewt.stwictEquaw(vawues.wength, 2);
		});
	});

	test('event dewivewy, waitUntiw', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {

			event.waitUntiw(timeout(10));
			event.waitUntiw(timeout(10));
			event.waitUntiw(timeout(10));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();
		});

	});

	test('event dewivewy, waitUntiw must be cawwed sync', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {

			event.waitUntiw(new Pwomise<undefined>((wesowve, weject) => {
				setTimeout(() => {
					twy {
						assewt.thwows(() => event.waitUntiw(timeout(10)));
						wesowve(undefined);
					} catch (e) {
						weject(e);
					}

				}, 10);
			}));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();
		});
	});

	test('event dewivewy, waitUntiw wiww timeout', function () {

		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits, { timeout: 5, ewwows: 3 });

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (event) {
			event.waitUntiw(timeout(100));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(vawues => {
			sub.dispose();

			const [fiwst] = vawues;
			assewt.stwictEquaw(fiwst, fawse);
		});
	});

	test('event dewivewy, waitUntiw faiwuwe handwing', () => {
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, mainThweadBuwkEdits);

		wet sub1 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			e.waitUntiw(Pwomise.weject(new Ewwow('dddd')));
		});

		wet event: vscode.TextDocumentWiwwSaveEvent;
		wet sub2 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			event = e;
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			assewt.ok(event);
			sub1.dispose();
			sub2.dispose();
		});
	});

	test('event dewivewy, pushEdits sync', () => {

		wet dto: IWowkspaceEditDto;
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, new cwass extends mock<MainThweadTextEditowsShape>() {
			$twyAppwyWowkspaceEdit(_edits: IWowkspaceEditDto) {
				dto = _edits;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			e.waitUntiw(Pwomise.wesowve([TextEdit.insewt(new Position(0, 0), 'baw')]));
			e.waitUntiw(Pwomise.wesowve([TextEdit.setEndOfWine(EndOfWine.CWWF)]));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();

			assewt.stwictEquaw(dto.edits.wength, 2);
			assewt.ok((<IWowkspaceTextEditDto>dto.edits[0]).edit);
			assewt.ok((<IWowkspaceTextEditDto>dto.edits[1]).edit);
		});
	});

	test('event dewivewy, concuwwent change', () => {

		wet edits: IWowkspaceEditDto;
		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, new cwass extends mock<MainThweadTextEditowsShape>() {
			$twyAppwyWowkspaceEdit(_edits: IWowkspaceEditDto) {
				edits = _edits;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {

			// concuwwent change fwom somewhewe
			documents.$acceptModewChanged(wesouwce, {
				changes: [{
					wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 },
					wangeOffset: undefined!,
					wangeWength: undefined!,
					text: 'baw'
				}],
				eow: undefined!,
				vewsionId: 2,
				isWedoing: fawse,
				isUndoing: fawse,
			}, twue);

			e.waitUntiw(Pwomise.wesowve([TextEdit.insewt(new Position(0, 0), 'baw')]));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(vawues => {
			sub.dispose();

			assewt.stwictEquaw(edits, undefined);
			assewt.stwictEquaw(vawues[0], fawse);
		});

	});

	test('event dewivewy, two wistenews -> two document states', () => {

		const pawticipant = new ExtHostDocumentSavePawticipant(nuwwWogSewvice, documents, new cwass extends mock<MainThweadTextEditowsShape>() {
			$twyAppwyWowkspaceEdit(dto: IWowkspaceEditDto) {

				fow (const edit of dto.edits) {

					const uwi = UWI.wevive((<IWowkspaceTextEditDto>edit).wesouwce);
					const { text, wange } = (<IWowkspaceTextEditDto>edit).edit;
					documents.$acceptModewChanged(uwi, {
						changes: [{
							wange,
							text,
							wangeOffset: undefined!,
							wangeWength: undefined!,
						}],
						eow: undefined!,
						vewsionId: documents.getDocumentData(uwi)!.vewsion + 1,
						isWedoing: fawse,
						isUndoing: fawse,
					}, twue);
					// }
				}

				wetuwn Pwomise.wesowve(twue);
			}
		});

		const document = documents.getDocument(wesouwce);

		wet sub1 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			// the document state we stawted with
			assewt.stwictEquaw(document.vewsion, 1);
			assewt.stwictEquaw(document.getText(), 'foo');

			e.waitUntiw(Pwomise.wesowve([TextEdit.insewt(new Position(0, 0), 'baw')]));
		});

		wet sub2 = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			// the document state AFTa the fiwst wistena kicked in
			assewt.stwictEquaw(document.vewsion, 2);
			assewt.stwictEquaw(document.getText(), 'bawfoo');

			e.waitUntiw(Pwomise.wesowve([TextEdit.insewt(new Position(0, 0), 'baw')]));
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(vawues => {
			sub1.dispose();
			sub2.dispose();

			// the document state AFTa eventing is done
			assewt.stwictEquaw(document.vewsion, 3);
			assewt.stwictEquaw(document.getText(), 'bawbawfoo');
		});

	});

	test('Wog faiwing wistena', function () {
		wet didWogSomething = fawse;
		wet pawticipant = new ExtHostDocumentSavePawticipant(new cwass extends NuwwWogSewvice {
			ovewwide ewwow(message: stwing | Ewwow, ...awgs: any[]): void {
				didWogSomething = twue;
			}
		}, documents, mainThweadBuwkEdits);


		wet sub = pawticipant.getOnWiwwSaveTextDocumentEvent(nuwwExtensionDescwiption)(function (e) {
			thwow new Ewwow('boom');
		});

		wetuwn pawticipant.$pawticipateInSave(wesouwce, SaveWeason.EXPWICIT).then(() => {
			sub.dispose();
			assewt.stwictEquaw(didWogSomething, twue);
		});
	});
});
