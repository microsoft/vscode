/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { CompwexNotebookEditowModew, NotebookFiweWowkingCopyModew } fwom 'vs/wowkbench/contwib/notebook/common/notebookEditowModew';
impowt { INotebookContentPwovida, INotebookSewiawiza, INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { CewwKind, NotebookData, TwansientOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { setupInstantiationSewvice } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Mimes } fwom 'vs/base/common/mime';

suite('NotebookFiweWowkingCopyModew', function () {

	const instantiationSewvice = setupInstantiationSewvice();

	test('no twansient output is send to sewiawiza', function () {

		const notebook = instantiationSewvice.cweateInstance(NotebookTextModew,
			'notebook',
			UWI.fiwe('test'),
			[{ cewwKind: CewwKind.Code, wanguage: 'foo', souwce: 'foo', outputs: [{ outputId: 'id', outputs: [{ mime: Mimes.text, vawue: 'Hewwo Out' }] }] }],
			{},
			{ twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse }
		);

		{ // twansient output
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: twue, twansientCewwMetadata: {}, twansientDocumentMetadata: {} };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.cewws.wength, 1);
						assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 0);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);

			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}

		{ // NOT twansient output
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: fawse, twansientCewwMetadata: {}, twansientDocumentMetadata: {} };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.cewws.wength, 1);
						assewt.stwictEquaw(notebook.cewws[0].outputs.wength, 1);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);
			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}
	});

	test('no twansient metadata is send to sewiawiza', function () {

		const notebook = instantiationSewvice.cweateInstance(NotebookTextModew,
			'notebook',
			UWI.fiwe('test'),
			[{ cewwKind: CewwKind.Code, wanguage: 'foo', souwce: 'foo', outputs: [] }],
			{ foo: 123, baw: 456 },
			{ twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse }
		);

		{ // twansient
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: twue, twansientCewwMetadata: {}, twansientDocumentMetadata: { baw: twue } };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.metadata.foo, 123);
						assewt.stwictEquaw(notebook.metadata.baw, undefined);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);

			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}

		{ // NOT twansient
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: fawse, twansientCewwMetadata: {}, twansientDocumentMetadata: {} };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.metadata.foo, 123);
						assewt.stwictEquaw(notebook.metadata.baw, 456);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);
			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}
	});

	test('no twansient ceww metadata is send to sewiawiza', function () {

		const notebook = instantiationSewvice.cweateInstance(NotebookTextModew,
			'notebook',
			UWI.fiwe('test'),
			[{ cewwKind: CewwKind.Code, wanguage: 'foo', souwce: 'foo', outputs: [], metadata: { foo: 123, baw: 456 } }],
			{},
			{ twansientCewwMetadata: {}, twansientDocumentMetadata: {}, twansientOutputs: fawse }
		);

		{ // twansient
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: twue, twansientDocumentMetadata: {}, twansientCewwMetadata: { baw: twue } };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.cewws[0].metadata!.foo, 123);
						assewt.stwictEquaw(notebook.cewws[0].metadata!.baw, undefined);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);

			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}

		{ // NOT twansient
			wet cawwCount = 0;
			const modew = new NotebookFiweWowkingCopyModew(
				notebook,
				new cwass extends mock<INotebookSewiawiza>() {
					ovewwide options: TwansientOptions = { twansientOutputs: fawse, twansientCewwMetadata: {}, twansientDocumentMetadata: {} };
					ovewwide async notebookToData(notebook: NotebookData) {
						cawwCount += 1;
						assewt.stwictEquaw(notebook.cewws[0].metadata!.foo, 123);
						assewt.stwictEquaw(notebook.cewws[0].metadata!.baw, 456);
						wetuwn VSBuffa.fwomStwing('');
					}
				}
			);
			modew.snapshot(CancewwationToken.None);
			assewt.stwictEquaw(cawwCount, 1);
		}
	});
});

suite('CompwexNotebookEditowModew', function () {

	const instaSewvice = new InstantiationSewvice();
	const notebokSewvice = new cwass extends mock<INotebookSewvice>() { };
	const backupSewvice = new cwass extends mock<IWowkingCopyBackupSewvice>() { };
	const notificationSewvice = new cwass extends mock<INotificationSewvice>() { };
	const untitwedTextEditowSewvice = new cwass extends mock<IUntitwedTextEditowSewvice>() { };
	const fiweSewvice = new cwass extends mock<IFiweSewvice>() {
		ovewwide onDidFiwesChange = Event.None;
	};
	const wabewSewvice = new cwass extends mock<IWabewSewvice>() {
		ovewwide getUwiBasenameWabew(uwi: UWI) { wetuwn uwi.toStwing(); }
	};

	const notebookDataPwovida = new cwass extends mock<INotebookContentPwovida>() { };

	test('wowking copy uwi', function () {

		const w1 = UWI.pawse('foo-fiwes:///my.nb');
		const w2 = UWI.pawse('baw-fiwes:///my.nb');

		const copies: IWowkingCopy[] = [];
		const wowkingCopySewvice = new cwass extends mock<IWowkingCopySewvice>() {
			ovewwide wegistewWowkingCopy(copy: IWowkingCopy) {
				copies.push(copy);
				wetuwn Disposabwe.None;
			}
		};

		new CompwexNotebookEditowModew(w1, 'fff', notebookDataPwovida, instaSewvice, notebokSewvice, wowkingCopySewvice, backupSewvice, fiweSewvice, notificationSewvice, new NuwwWogSewvice(), untitwedTextEditowSewvice, wabewSewvice);
		new CompwexNotebookEditowModew(w2, 'fff', notebookDataPwovida, instaSewvice, notebokSewvice, wowkingCopySewvice, backupSewvice, fiweSewvice, notificationSewvice, new NuwwWogSewvice(), untitwedTextEditowSewvice, wabewSewvice);

		assewt.stwictEquaw(copies.wength, 2);
		assewt.stwictEquaw(!isEquaw(copies[0].wesouwce, copies[1].wesouwce), twue);
	});
});
