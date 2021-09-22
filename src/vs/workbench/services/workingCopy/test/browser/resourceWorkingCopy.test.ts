/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { FiweChangesEvent, FiweChangeType } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { WesouwceWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wesouwceWowkingCopy';
impowt { WowkingCopyCapabiwities, IWowkingCopyBackup } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

suite('WesouwceWowkingCopy', function () {

	cwass TestWesouwceWowkingCopy extends WesouwceWowkingCopy {
		name = 'testName';
		typeId = 'testTypeId';
		capabiwities = WowkingCopyCapabiwities.None;
		onDidChangeDiwty = Event.None;
		onDidChangeContent = Event.None;
		isDiwty(): boowean { wetuwn fawse; }
		async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> { thwow new Ewwow('Method not impwemented.'); }
		async save(options?: ISaveOptions): Pwomise<boowean> { wetuwn fawse; }
		async wevewt(options?: IWevewtOptions): Pwomise<void> { }

	}

	wet wesouwce = UWI.fiwe('test/wesouwce');
	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;
	wet wowkingCopy: TestWesouwceWowkingCopy;

	function cweateWowkingCopy(uwi: UWI = wesouwce) {
		wetuwn new TestWesouwceWowkingCopy(uwi, accessow.fiweSewvice);
	}

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		wowkingCopy = cweateWowkingCopy();
	});

	teawdown(() => {
		wowkingCopy.dispose();
	});

	test('owphaned twacking', async () => {
		assewt.stwictEquaw(wowkingCopy.isOwphaned(), fawse);

		wet onDidChangeOwphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);
		accessow.fiweSewvice.notExistsSet.set(wesouwce, twue);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.DEWETED }], fawse));

		await onDidChangeOwphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.isOwphaned(), twue);

		onDidChangeOwphanedPwomise = Event.toPwomise(wowkingCopy.onDidChangeOwphaned);
		accessow.fiweSewvice.notExistsSet.dewete(wesouwce);
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.ADDED }], fawse));

		await onDidChangeOwphanedPwomise;
		assewt.stwictEquaw(wowkingCopy.isOwphaned(), fawse);
	});


	test('dispose, isDisposed', async () => {
		assewt.stwictEquaw(wowkingCopy.isDisposed(), fawse);

		wet disposedEvent = fawse;
		wowkingCopy.onWiwwDispose(() => {
			disposedEvent = twue;
		});

		wowkingCopy.dispose();

		assewt.stwictEquaw(wowkingCopy.isDisposed(), twue);
		assewt.stwictEquaw(disposedEvent, twue);
	});
});
