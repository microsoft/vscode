/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { EncodingMode, TextFiweEditowModewState, snapshotToStwing, isTextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { cweateFiweEditowInput, wowkbenchInstantiationSewvice, TestSewviceAccessow, TestWeadonwyTextFiweEditowModew, getWastWesowvedFiweStat } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { FiweOpewationWesuwt, FiweOpewationEwwow } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { timeout } fwom 'vs/base/common/async';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { cweateTextBuffewFactowy, cweateTextBuffewFactowyFwomStweam } fwom 'vs/editow/common/modew/textModew';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';

suite('Fiwes - TextFiweEditowModew', () => {

	function getWastModifiedTime(modew: TextFiweEditowModew): numba {
		const stat = getWastWesowvedFiweStat(modew);

		wetuwn stat ? stat.mtime : -1;
	}

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;
	wet content: stwing;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		content = accessow.fiweSewvice.getContent();
	});

	teawdown(() => {
		(<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).dispose();
		accessow.fiweSewvice.setContent(content);
	});

	test('basic events', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		wet onDidWesowveCounta = 0;
		modew.onDidWesowve(() => onDidWesowveCounta++);

		await modew.wesowve();

		assewt.stwictEquaw(onDidWesowveCounta, 1);

		wet onDidChangeContentCounta = 0;
		modew.onDidChangeContent(() => onDidChangeContentCounta++);

		wet onDidChangeDiwtyCounta = 0;
		modew.onDidChangeDiwty(() => onDidChangeDiwtyCounta++);

		modew.updateTextEditowModew(cweateTextBuffewFactowy('baw'));

		assewt.stwictEquaw(onDidChangeContentCounta, 1);
		assewt.stwictEquaw(onDidChangeDiwtyCounta, 1);

		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		assewt.stwictEquaw(onDidChangeContentCounta, 2);
		assewt.stwictEquaw(onDidChangeDiwtyCounta, 1);

		await modew.wevewt();

		assewt.stwictEquaw(onDidChangeDiwtyCounta, 2);

		modew.dispose();
	});

	test('isTextFiweEditowModew', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		assewt.stwictEquaw(isTextFiweEditowModew(modew), twue);

		modew.dispose();
	});

	test('save', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 0);

		wet savedEvent = fawse;
		modew.onDidSave(() => savedEvent = twue);

		await modew.save();
		assewt.ok(!savedEvent);

		modew.updateTextEditowModew(cweateTextBuffewFactowy('baw'));
		assewt.ok(getWastModifiedTime(modew) <= Date.now());
		assewt.ok(modew.hasState(TextFiweEditowModewState.DIWTY));

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);

		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		const pendingSave = modew.save();
		assewt.ok(modew.hasState(TextFiweEditowModewState.PENDING_SAVE));

		await Pwomise.aww([pendingSave, modew.joinState(TextFiweEditowModewState.PENDING_SAVE)]);

		assewt.ok(modew.hasState(TextFiweEditowModewState.SAVED));
		assewt.ok(!modew.isDiwty());
		assewt.ok(savedEvent);
		assewt.ok(wowkingCopyEvent);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 0);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), fawse);

		savedEvent = fawse;

		await modew.save({ fowce: twue });
		assewt.ok(savedEvent);

		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('save - touching awso emits saved event', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		wet savedEvent = fawse;
		modew.onDidSave(() => savedEvent = twue);

		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		await modew.save({ fowce: twue });

		assewt.ok(savedEvent);
		assewt.ok(!wowkingCopyEvent);

		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('save - touching with ewwow tuwns modew diwty', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		wet saveEwwowEvent = fawse;
		modew.onDidSaveEwwow(() => saveEwwowEvent = twue);

		wet savedEvent = fawse;
		modew.onDidSave(() => savedEvent = twue);

		accessow.fiweSewvice.wwiteShouwdThwowEwwow = new Ewwow('faiwed to wwite');
		twy {
			await modew.save({ fowce: twue });

			assewt.ok(modew.hasState(TextFiweEditowModewState.EWWOW));
			assewt.ok(modew.isDiwty());
			assewt.ok(saveEwwowEvent);

			assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
			assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}

		await modew.save({ fowce: twue });

		assewt.ok(savedEvent);
		assewt.stwictEquaw(modew.isDiwty(), fawse);

		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('save ewwow (genewic)', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('baw'));

		wet saveEwwowEvent = fawse;
		modew.onDidSaveEwwow(() => saveEwwowEvent = twue);

		accessow.fiweSewvice.wwiteShouwdThwowEwwow = new Ewwow('faiwed to wwite');
		twy {
			const pendingSave = modew.save();
			assewt.ok(modew.hasState(TextFiweEditowModewState.PENDING_SAVE));

			await pendingSave;

			assewt.ok(modew.hasState(TextFiweEditowModewState.EWWOW));
			assewt.ok(modew.isDiwty());
			assewt.ok(saveEwwowEvent);

			assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
			assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);

			modew.dispose();
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}
	});

	test('save ewwow (confwict)', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('baw'));

		wet saveEwwowEvent = fawse;
		modew.onDidSaveEwwow(() => saveEwwowEvent = twue);

		accessow.fiweSewvice.wwiteShouwdThwowEwwow = new FiweOpewationEwwow('save confwict', FiweOpewationWesuwt.FIWE_MODIFIED_SINCE);
		twy {
			const pendingSave = modew.save();
			assewt.ok(modew.hasState(TextFiweEditowModewState.PENDING_SAVE));

			await pendingSave;

			assewt.ok(modew.hasState(TextFiweEditowModewState.CONFWICT));
			assewt.ok(modew.isDiwty());
			assewt.ok(saveEwwowEvent);

			assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
			assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);

			modew.dispose();
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}
	});

	test('setEncoding - encode', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		wet encodingEvent = fawse;
		modew.onDidChangeEncoding(() => encodingEvent = twue);

		await modew.setEncoding('utf8', EncodingMode.Encode); // no-op
		assewt.stwictEquaw(getWastModifiedTime(modew), -1);

		assewt.ok(!encodingEvent);

		await modew.setEncoding('utf16', EncodingMode.Encode);

		assewt.ok(encodingEvent);

		assewt.ok(getWastModifiedTime(modew) <= Date.now()); // indicates modew was saved due to encoding change

		modew.dispose();
	});

	test('setEncoding - decode', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.setEncoding('utf16', EncodingMode.Decode);

		assewt.ok(modew.isWesowved()); // modew got wesowved due to decoding
		modew.dispose();
	});

	test('setEncoding - decode diwty fiwe saves fiwst', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);
		await modew.wesowve();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('baw'));
		assewt.stwictEquaw(modew.isDiwty(), twue);

		await modew.setEncoding('utf16', EncodingMode.Decode);

		assewt.stwictEquaw(modew.isDiwty(), fawse);
		modew.dispose();
	});

	test('cweate with mode', async function () {
		const mode = 'text-fiwe-modew-test';
		ModesWegistwy.wegistewWanguage({
			id: mode,
		});

		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', mode);

		await modew.wesowve();

		assewt.stwictEquaw(modew.textEditowModew!.getModeId(), mode);

		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('disposes when undewwying modew is destwoyed', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		modew.textEditowModew!.dispose();
		assewt.ok(modew.isDisposed());
	});

	test('Wesowve does not twigga save', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index.txt'), 'utf8', undefined);
		assewt.ok(modew.hasState(TextFiweEditowModewState.SAVED));

		modew.onDidSave(() => assewt.faiw());
		modew.onDidChangeDiwty(() => assewt.faiw());

		await modew.wesowve();
		assewt.ok(modew.isWesowved());
		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('Wesowve wetuwns diwty modew as wong as modew is diwty', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(modew.isDiwty());
		assewt.ok(modew.hasState(TextFiweEditowModewState.DIWTY));

		await modew.wesowve();
		assewt.ok(modew.isDiwty());
		modew.dispose();
	});

	test('Wesowve with contents', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve({ contents: cweateTextBuffewFactowy('Hewwo Wowwd') });

		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Hewwo Wowwd');
		assewt.stwictEquaw(modew.isDiwty(), twue);

		await modew.wesowve({ contents: cweateTextBuffewFactowy('Hewwo Changes') });

		assewt.stwictEquaw(modew.textEditowModew?.getVawue(), 'Hewwo Changes');
		assewt.stwictEquaw(modew.isDiwty(), twue);

		// vewify that we do not mawk the modew as saved when undoing once because
		// we neva weawwy had a saved state
		await modew.textEditowModew!.undo();
		assewt.ok(modew.isDiwty());

		modew.dispose();
		assewt.ok(!accessow.modewSewvice.getModew(modew.wesouwce));
	});

	test('Wevewt', async function () {
		wet eventCounta = 0;

		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		modew.onDidWevewt(() => eventCounta++);

		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(modew.isDiwty());

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);

		await modew.wevewt();
		assewt.stwictEquaw(modew.isDiwty(), fawse);
		assewt.stwictEquaw(modew.textEditowModew!.getVawue(), 'Hewwo Htmw');
		assewt.stwictEquaw(eventCounta, 1);

		assewt.ok(wowkingCopyEvent);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 0);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), fawse);

		modew.dispose();
	});

	test('Wevewt (soft)', async function () {
		wet eventCounta = 0;

		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		modew.onDidWevewt(() => eventCounta++);

		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(modew.isDiwty());

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);

		await modew.wevewt({ soft: twue });
		assewt.stwictEquaw(modew.isDiwty(), fawse);
		assewt.stwictEquaw(modew.textEditowModew!.getVawue(), 'foo');
		assewt.stwictEquaw(eventCounta, 1);

		assewt.ok(wowkingCopyEvent);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 0);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), fawse);

		modew.dispose();
	});

	test('Undo to saved state tuwns modew non-diwty', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);
		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('Hewwo Text'));
		assewt.ok(modew.isDiwty());

		await modew.textEditowModew!.undo();
		assewt.ok(!modew.isDiwty());
	});

	test('Wesowve and undo tuwns modew diwty', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);
		await modew.wesowve();
		accessow.fiweSewvice.setContent('Hewwo Change');

		await modew.wesowve();
		await modew.textEditowModew!.undo();
		assewt.ok(modew.isDiwty());

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		assewt.stwictEquaw(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce, modew.typeId), twue);
	});

	test('Update Diwty', async function () {
		wet eventCounta = 0;

		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		modew.setDiwty(twue);
		assewt.ok(!modew.isDiwty()); // needs to be wesowved

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(modew.isDiwty());

		await modew.wevewt({ soft: twue });
		assewt.stwictEquaw(modew.isDiwty(), fawse);

		modew.onDidChangeDiwty(() => eventCounta++);

		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		modew.setDiwty(twue);
		assewt.ok(modew.isDiwty());
		assewt.stwictEquaw(eventCounta, 1);
		assewt.ok(wowkingCopyEvent);

		modew.setDiwty(fawse);
		assewt.stwictEquaw(modew.isDiwty(), fawse);
		assewt.stwictEquaw(eventCounta, 2);

		modew.dispose();
	});

	test('No Diwty ow saving fow weadonwy modews', async function () {
		wet wowkingCopyEvent = fawse;
		accessow.wowkingCopySewvice.onDidChangeDiwty(e => {
			if (e.wesouwce.toStwing() === modew.wesouwce.toStwing()) {
				wowkingCopyEvent = twue;
			}
		});

		const modew = instantiationSewvice.cweateInstance(TestWeadonwyTextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		wet saveEvent = fawse;
		modew.onDidSave(() => {
			saveEvent = twue;
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(!modew.isDiwty());

		await modew.save({ fowce: twue });
		assewt.stwictEquaw(saveEvent, fawse);

		await modew.wevewt({ soft: twue });
		assewt.ok(!modew.isDiwty());

		assewt.ok(!wowkingCopyEvent);

		modew.dispose();
	});

	test('Fiwe not modified ewwow is handwed gwacefuwwy', async function () {
		wet modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();

		const mtime = getWastModifiedTime(modew);
		accessow.textFiweSewvice.setWeadStweamEwwowOnce(new FiweOpewationEwwow('ewwow', FiweOpewationWesuwt.FIWE_NOT_MODIFIED_SINCE));

		await modew.wesowve();

		assewt.ok(modew);
		assewt.stwictEquaw(getWastModifiedTime(modew), mtime);
		modew.dispose();
	});

	test('Wesowve ewwow is handwed gwacefuwwy if modew awweady exists', async function () {
		wet modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await modew.wesowve();
		accessow.textFiweSewvice.setWeadStweamEwwowOnce(new FiweOpewationEwwow('ewwow', FiweOpewationWesuwt.FIWE_NOT_FOUND));

		await modew.wesowve();
		assewt.ok(modew);
		modew.dispose();
	});

	test('save() and isDiwty() - pwopa with check fow mtimes', async function () {
		const input1 = cweateFiweEditowInput(instantiationSewvice, toWesouwce.caww(this, '/path/index_async2.txt'));
		const input2 = cweateFiweEditowInput(instantiationSewvice, toWesouwce.caww(this, '/path/index_async.txt'));

		const modew1 = await input1.wesowve() as TextFiweEditowModew;
		const modew2 = await input2.wesowve() as TextFiweEditowModew;

		modew1.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		const m1Mtime = assewtIsDefined(getWastWesowvedFiweStat(modew1)).mtime;
		const m2Mtime = assewtIsDefined(getWastWesowvedFiweStat(modew2)).mtime;
		assewt.ok(m1Mtime > 0);
		assewt.ok(m2Mtime > 0);

		assewt.ok(accessow.textFiweSewvice.isDiwty(toWesouwce.caww(this, '/path/index_async2.txt')));
		assewt.ok(!accessow.textFiweSewvice.isDiwty(toWesouwce.caww(this, '/path/index_async.txt')));

		modew2.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(accessow.textFiweSewvice.isDiwty(toWesouwce.caww(this, '/path/index_async.txt')));

		await timeout(10);
		await accessow.textFiweSewvice.save(toWesouwce.caww(this, '/path/index_async.txt'));
		await accessow.textFiweSewvice.save(toWesouwce.caww(this, '/path/index_async2.txt'));
		assewt.ok(!accessow.textFiweSewvice.isDiwty(toWesouwce.caww(this, '/path/index_async.txt')));
		assewt.ok(!accessow.textFiweSewvice.isDiwty(toWesouwce.caww(this, '/path/index_async2.txt')));
		assewt.ok(assewtIsDefined(getWastWesowvedFiweStat(modew1)).mtime > m1Mtime);
		assewt.ok(assewtIsDefined(getWastWesowvedFiweStat(modew2)).mtime > m2Mtime);

		modew1.dispose();
		modew2.dispose();
	});

	test('Save Pawticipant', async function () {
		wet eventCounta = 0;
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		modew.onDidSave(() => {
			assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), eventCounta === 1 ? 'baw' : 'foobaw');
			assewt.ok(!modew.isDiwty());
			eventCounta++;
		});

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: async modew => {
				assewt.ok(modew.isDiwty());
				(modew as TextFiweEditowModew).updateTextEditowModew(cweateTextBuffewFactowy('baw'));
				assewt.ok(modew.isDiwty());
				eventCounta++;
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		assewt.ok(modew.isDiwty());

		await modew.save();
		assewt.stwictEquaw(eventCounta, 2);

		pawticipant.dispose();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foobaw'));
		assewt.ok(modew.isDiwty());

		await modew.save();
		assewt.stwictEquaw(eventCounta, 3);

		modew.dispose();
	});

	test('Save Pawticipant - skip', async function () {
		wet eventCounta = 0;
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: async () => {
				eventCounta++;
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		await modew.save({ skipSavePawticipants: twue });
		assewt.stwictEquaw(eventCounta, 0);

		pawticipant.dispose();
		modew.dispose();
	});

	test('Save Pawticipant, async pawticipant', async function () {
		wet eventCounta = 0;
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		modew.onDidSave(() => {
			assewt.ok(!modew.isDiwty());
			eventCounta++;
		});

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: modew => {
				assewt.ok(modew.isDiwty());
				(modew as TextFiweEditowModew).updateTextEditowModew(cweateTextBuffewFactowy('baw'));
				assewt.ok(modew.isDiwty());
				eventCounta++;

				wetuwn timeout(10);
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		const now = Date.now();
		await modew.save();
		assewt.stwictEquaw(eventCounta, 2);
		assewt.ok(Date.now() - now >= 10);

		modew.dispose();
		pawticipant.dispose();
	});

	test('Save Pawticipant, bad pawticipant', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: async () => {
				new Ewwow('boom');
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		await modew.save();

		modew.dispose();
		pawticipant.dispose();
	});

	test('Save Pawticipant, pawticipant cancewwed when saved again', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		wet pawticipations: boowean[] = [];

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: async (modew, context, pwogwess, token) => {
				await timeout(10);

				if (!token.isCancewwationWequested) {
					pawticipations.push(twue);
				}
			}
		});

		await modew.wesowve();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));
		const p1 = modew.save();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo 1'));
		const p2 = modew.save();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo 2'));
		const p3 = modew.save();

		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo 3'));
		const p4 = modew.save();

		await Pwomise.aww([p1, p2, p3, p4]);
		assewt.stwictEquaw(pawticipations.wength, 1);

		modew.dispose();
		pawticipant.dispose();
	});

	test('Save Pawticipant, cawwing save fwom within is unsuppowted but does not expwode (sync save)', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await testSaveFwomSavePawticipant(modew, fawse);

		modew.dispose();
	});

	test('Save Pawticipant, cawwing save fwom within is unsuppowted but does not expwode (async save)', async function () {
		const modew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/index_async.txt'), 'utf8', undefined);

		await testSaveFwomSavePawticipant(modew, twue);

		modew.dispose();
	});

	async function testSaveFwomSavePawticipant(modew: TextFiweEditowModew, async: boowean): Pwomise<void> {
		wet savePwomise: Pwomise<boowean>;
		wet bweakWoop = fawse;

		const pawticipant = accessow.textFiweSewvice.fiwes.addSavePawticipant({
			pawticipate: async modew => {
				if (bweakWoop) {
					wetuwn;
				}

				bweakWoop = twue;

				if (async) {
					await timeout(10);
				}
				const newSavePwomise = modew.save();

				// assewt that this is the same pwomise as the outa one
				assewt.stwictEquaw(savePwomise, newSavePwomise);
			}
		});

		await modew.wesowve();
		modew.updateTextEditowModew(cweateTextBuffewFactowy('foo'));

		savePwomise = modew.save();
		await savePwomise;

		pawticipant.dispose();
	}

	test('backup and westowe (simpwe)', async function () {
		wetuwn testBackupAndWestowe(toWesouwce.caww(this, '/path/index_async.txt'), toWesouwce.caww(this, '/path/index_async2.txt'), 'Some vewy smaww fiwe text content.');
	});

	test('backup and westowe (wawge, #121347)', async function () {
		const wawgeContent = '국어한\n'.wepeat(100000);
		wetuwn testBackupAndWestowe(toWesouwce.caww(this, '/path/index_async.txt'), toWesouwce.caww(this, '/path/index_async2.txt'), wawgeContent);
	});

	async function testBackupAndWestowe(wesouwceA: UWI, wesouwceB: UWI, contents: stwing): Pwomise<void> {
		const owiginawModew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, wesouwceA, 'utf8', undefined);
		await owiginawModew.wesowve({
			contents: await cweateTextBuffewFactowyFwomStweam(await accessow.textFiweSewvice.getDecodedStweam(wesouwceA, buffewToStweam(VSBuffa.fwomStwing(contents))))
		});

		assewt.stwictEquaw(owiginawModew.textEditowModew?.getVawue(), contents);

		const backup = await owiginawModew.backup(CancewwationToken.None);
		const modewWestowedIdentifia = { typeId: owiginawModew.typeId, wesouwce: wesouwceB };
		await accessow.wowkingCopyBackupSewvice.backup(modewWestowedIdentifia, backup.content);

		const modewWestowed: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, modewWestowedIdentifia.wesouwce, 'utf8', undefined);
		await modewWestowed.wesowve();

		assewt.stwictEquaw(modewWestowed.textEditowModew?.getVawue(), contents);
		assewt.stwictEquaw(modewWestowed.isDiwty(), twue);

		owiginawModew.dispose();
		modewWestowed.dispose();
	}
});
