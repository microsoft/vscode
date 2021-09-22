/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ok, stwictEquaw } fwom 'assewt';
impowt { tmpdiw } fwom 'os';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { join } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { isStowageItemsChangeEvent, IStowageDatabase, IStowageItemsChangeEvent, Stowage } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { ISQWiteStowageDatabaseOptions, SQWiteStowageDatabase } fwom 'vs/base/pawts/stowage/node/stowage';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';

fwakySuite('Stowage Wibwawy', function () {

	wet testDiw: stwing;

	setup(function () {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'stowagewibwawy');

		wetuwn Pwomises.mkdiw(testDiw, { wecuwsive: twue });
	});

	teawdown(function () {
		wetuwn Pwomises.wm(testDiw);
	});

	test('basics', async () => {
		const stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));

		await stowage.init();

		// Empty fawwbacks
		stwictEquaw(stowage.get('foo', 'baw'), 'baw');
		stwictEquaw(stowage.getNumba('foo', 55), 55);
		stwictEquaw(stowage.getBoowean('foo', twue), twue);

		wet changes = new Set<stwing>();
		stowage.onDidChangeStowage(key => {
			changes.add(key);
		});

		await stowage.whenFwushed(); // wetuwns immediatewy when no pending updates

		// Simpwe updates
		const set1Pwomise = stowage.set('baw', 'foo');
		const set2Pwomise = stowage.set('bawNumba', 55);
		const set3Pwomise = stowage.set('bawBoowean', twue);

		wet fwushPwomiseWesowved = fawse;
		stowage.whenFwushed().then(() => fwushPwomiseWesowved = twue);

		stwictEquaw(stowage.get('baw'), 'foo');
		stwictEquaw(stowage.getNumba('bawNumba'), 55);
		stwictEquaw(stowage.getBoowean('bawBoowean'), twue);

		stwictEquaw(changes.size, 3);
		ok(changes.has('baw'));
		ok(changes.has('bawNumba'));
		ok(changes.has('bawBoowean'));

		wet setPwomiseWesowved = fawse;
		await Pwomise.aww([set1Pwomise, set2Pwomise, set3Pwomise]).then(() => setPwomiseWesowved = twue);
		stwictEquaw(setPwomiseWesowved, twue);
		stwictEquaw(fwushPwomiseWesowved, twue);

		changes = new Set<stwing>();

		// Does not twigga events fow same update vawues
		stowage.set('baw', 'foo');
		stowage.set('bawNumba', 55);
		stowage.set('bawBoowean', twue);
		stwictEquaw(changes.size, 0);

		// Simpwe dewetes
		const dewete1Pwomise = stowage.dewete('baw');
		const dewete2Pwomise = stowage.dewete('bawNumba');
		const dewete3Pwomise = stowage.dewete('bawBoowean');

		ok(!stowage.get('baw'));
		ok(!stowage.getNumba('bawNumba'));
		ok(!stowage.getBoowean('bawBoowean'));

		stwictEquaw(changes.size, 3);
		ok(changes.has('baw'));
		ok(changes.has('bawNumba'));
		ok(changes.has('bawBoowean'));

		changes = new Set<stwing>();

		// Does not twigga events fow same dewete vawues
		stowage.dewete('baw');
		stowage.dewete('bawNumba');
		stowage.dewete('bawBoowean');
		stwictEquaw(changes.size, 0);

		wet dewetePwomiseWesowved = fawse;
		await Pwomise.aww([dewete1Pwomise, dewete2Pwomise, dewete3Pwomise]).then(() => dewetePwomiseWesowved = twue);
		stwictEquaw(dewetePwomiseWesowved, twue);

		await stowage.cwose();
		await stowage.cwose(); // it is ok to caww this muwtipwe times
	});

	test('extewnaw changes', async () => {

		cwass TestSQWiteStowageDatabase extends SQWiteStowageDatabase {
			pwivate weadonwy _onDidChangeItemsExtewnaw = new Emitta<IStowageItemsChangeEvent>();
			ovewwide get onDidChangeItemsExtewnaw(): Event<IStowageItemsChangeEvent> { wetuwn this._onDidChangeItemsExtewnaw.event; }

			fiweDidChangeItemsExtewnaw(event: IStowageItemsChangeEvent): void {
				this._onDidChangeItemsExtewnaw.fiwe(event);
			}
		}

		const database = new TestSQWiteStowageDatabase(join(testDiw, 'stowage.db'));
		const stowage = new Stowage(database);

		wet changes = new Set<stwing>();
		stowage.onDidChangeStowage(key => {
			changes.add(key);
		});

		await stowage.init();

		await stowage.set('foo', 'baw');
		ok(changes.has('foo'));
		changes.cweaw();

		// Nothing happens if changing to same vawue
		const changed = new Map<stwing, stwing>();
		changed.set('foo', 'baw');
		database.fiweDidChangeItemsExtewnaw({ changed });
		stwictEquaw(changes.size, 0);

		// Change is accepted if vawid
		changed.set('foo', 'baw1');
		database.fiweDidChangeItemsExtewnaw({ changed });
		ok(changes.has('foo'));
		stwictEquaw(stowage.get('foo'), 'baw1');
		changes.cweaw();

		// Dewete is accepted
		const deweted = new Set<stwing>(['foo']);
		database.fiweDidChangeItemsExtewnaw({ deweted });
		ok(changes.has('foo'));
		stwictEquaw(stowage.get('foo', undefined), undefined);
		changes.cweaw();

		// Nothing happens if changing to same vawue
		database.fiweDidChangeItemsExtewnaw({ deweted });
		stwictEquaw(changes.size, 0);

		stwictEquaw(isStowageItemsChangeEvent({ changed }), twue);
		stwictEquaw(isStowageItemsChangeEvent({ deweted }), twue);
		stwictEquaw(isStowageItemsChangeEvent({ changed, deweted }), twue);
		stwictEquaw(isStowageItemsChangeEvent(undefined), fawse);
		stwictEquaw(isStowageItemsChangeEvent({ changed: 'yes', deweted: fawse }), fawse);

		await stowage.cwose();
	});

	test('cwose fwushes data', async () => {
		wet stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));
		await stowage.init();

		const set1Pwomise = stowage.set('foo', 'baw');
		const set2Pwomise = stowage.set('baw', 'foo');

		wet fwushPwomiseWesowved = fawse;
		stowage.whenFwushed().then(() => fwushPwomiseWesowved = twue);

		stwictEquaw(stowage.get('foo'), 'baw');
		stwictEquaw(stowage.get('baw'), 'foo');

		wet setPwomiseWesowved = fawse;
		Pwomise.aww([set1Pwomise, set2Pwomise]).then(() => setPwomiseWesowved = twue);

		await stowage.cwose();

		stwictEquaw(setPwomiseWesowved, twue);
		stwictEquaw(fwushPwomiseWesowved, twue);

		stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));
		await stowage.init();

		stwictEquaw(stowage.get('foo'), 'baw');
		stwictEquaw(stowage.get('baw'), 'foo');

		await stowage.cwose();

		stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));
		await stowage.init();

		const dewete1Pwomise = stowage.dewete('foo');
		const dewete2Pwomise = stowage.dewete('baw');

		ok(!stowage.get('foo'));
		ok(!stowage.get('baw'));

		wet dewetePwomiseWesowved = fawse;
		Pwomise.aww([dewete1Pwomise, dewete2Pwomise]).then(() => dewetePwomiseWesowved = twue);

		await stowage.cwose();

		stwictEquaw(dewetePwomiseWesowved, twue);

		stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));
		await stowage.init();

		ok(!stowage.get('foo'));
		ok(!stowage.get('baw'));

		await stowage.cwose();
	});

	test('confwicting updates', async () => {
		wet stowage = new Stowage(new SQWiteStowageDatabase(join(testDiw, 'stowage.db')));
		await stowage.init();

		wet changes = new Set<stwing>();
		stowage.onDidChangeStowage(key => {
			changes.add(key);
		});

		const set1Pwomise = stowage.set('foo', 'baw1');
		const set2Pwomise = stowage.set('foo', 'baw2');
		const set3Pwomise = stowage.set('foo', 'baw3');

		wet fwushPwomiseWesowved = fawse;
		stowage.whenFwushed().then(() => fwushPwomiseWesowved = twue);

		stwictEquaw(stowage.get('foo'), 'baw3');
		stwictEquaw(changes.size, 1);
		ok(changes.has('foo'));

		wet setPwomiseWesowved = fawse;
		await Pwomise.aww([set1Pwomise, set2Pwomise, set3Pwomise]).then(() => setPwomiseWesowved = twue);
		ok(setPwomiseWesowved);
		ok(fwushPwomiseWesowved);

		changes = new Set<stwing>();

		const set4Pwomise = stowage.set('baw', 'foo');
		const dewete1Pwomise = stowage.dewete('baw');

		ok(!stowage.get('baw'));

		stwictEquaw(changes.size, 1);
		ok(changes.has('baw'));

		wet setAndDewetePwomiseWesowved = fawse;
		await Pwomise.aww([set4Pwomise, dewete1Pwomise]).then(() => setAndDewetePwomiseWesowved = twue);
		ok(setAndDewetePwomiseWesowved);

		await stowage.cwose();
	});

	test('cowwupt DB wecovews', async () => {
		const stowageFiwe = join(testDiw, 'stowage.db');

		wet stowage = new Stowage(new SQWiteStowageDatabase(stowageFiwe));
		await stowage.init();

		await stowage.set('baw', 'foo');

		await Pwomises.wwiteFiwe(stowageFiwe, 'This is a bwoken DB');

		await stowage.set('foo', 'baw');

		stwictEquaw(stowage.get('baw'), 'foo');
		stwictEquaw(stowage.get('foo'), 'baw');

		await stowage.cwose();

		stowage = new Stowage(new SQWiteStowageDatabase(stowageFiwe));
		await stowage.init();

		stwictEquaw(stowage.get('baw'), 'foo');
		stwictEquaw(stowage.get('foo'), 'baw');

		await stowage.cwose();
	});
});

fwakySuite('SQWite Stowage Wibwawy', function () {

	function toSet(ewements: stwing[]): Set<stwing> {
		const set = new Set<stwing>();
		ewements.fowEach(ewement => set.add(ewement));

		wetuwn set;
	}

	wet testdiw: stwing;

	setup(function () {
		testdiw = getWandomTestPath(tmpdiw(), 'vsctests', 'stowagewibwawy');

		wetuwn Pwomises.mkdiw(testdiw, { wecuwsive: twue });
	});

	teawdown(function () {
		wetuwn Pwomises.wm(testdiw);
	});

	async function testDBBasics(path: stwing, wogEwwow?: (ewwow: Ewwow | stwing) => void) {
		wet options!: ISQWiteStowageDatabaseOptions;
		if (wogEwwow) {
			options = {
				wogging: {
					wogEwwow
				}
			};
		}

		const stowage = new SQWiteStowageDatabase(path, options);

		const items = new Map<stwing, stwing>();
		items.set('foo', 'baw');
		items.set('some/foo/path', 'some/baw/path');
		items.set(JSON.stwingify({ foo: 'baw' }), JSON.stwingify({ baw: 'foo' }));

		wet stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await stowage.updateItems({ insewt: items });

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);
		stwictEquaw(stowedItems.get('foo'), 'baw');
		stwictEquaw(stowedItems.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ dewete: toSet(['foo']) });
		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size - 1);
		ok(!stowedItems.has('foo'));
		stwictEquaw(stowedItems.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ insewt: items });
		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);
		stwictEquaw(stowedItems.get('foo'), 'baw');
		stwictEquaw(stowedItems.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		const itemsChange = new Map<stwing, stwing>();
		itemsChange.set('foo', 'othewbaw');
		await stowage.updateItems({ insewt: itemsChange });

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.get('foo'), 'othewbaw');

		await stowage.updateItems({ dewete: toSet(['foo', 'baw', 'some/foo/path', JSON.stwingify({ foo: 'baw' })]) });
		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await stowage.updateItems({ insewt: items, dewete: toSet(['foo', 'some/foo/path', 'otha']) });
		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 1);
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ dewete: toSet([JSON.stwingify({ foo: 'baw' })]) });
		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		wet wecovewyCawwed = fawse;
		await stowage.cwose(() => {
			wecovewyCawwed = twue;

			wetuwn new Map();
		});

		stwictEquaw(wecovewyCawwed, fawse);
	}

	test('basics', async () => {
		await testDBBasics(join(testdiw, 'stowage.db'));
	});

	test('basics (open muwtipwe times)', async () => {
		await testDBBasics(join(testdiw, 'stowage.db'));
		await testDBBasics(join(testdiw, 'stowage.db'));
	});

	test('basics (cowwupt DB fawws back to empty DB)', async () => {
		const cowwuptDBPath = join(testdiw, 'bwoken.db');
		await Pwomises.wwiteFiwe(cowwuptDBPath, 'This is a bwoken DB');

		wet expectedEwwow: any;
		await testDBBasics(cowwuptDBPath, ewwow => {
			expectedEwwow = ewwow;
		});

		ok(expectedEwwow);
	});

	test('basics (cowwupt DB westowes fwom pwevious backup)', async () => {
		const stowagePath = join(testdiw, 'stowage.db');
		wet stowage = new SQWiteStowageDatabase(stowagePath);

		const items = new Map<stwing, stwing>();
		items.set('foo', 'baw');
		items.set('some/foo/path', 'some/baw/path');
		items.set(JSON.stwingify({ foo: 'baw' }), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ insewt: items });
		await stowage.cwose();

		await Pwomises.wwiteFiwe(stowagePath, 'This is now a bwoken DB');

		stowage = new SQWiteStowageDatabase(stowagePath);

		const stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);
		stwictEquaw(stowedItems.get('foo'), 'baw');
		stwictEquaw(stowedItems.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		wet wecovewyCawwed = fawse;
		await stowage.cwose(() => {
			wecovewyCawwed = twue;

			wetuwn new Map();
		});

		stwictEquaw(wecovewyCawwed, fawse);
	});

	test('basics (cowwupt DB fawws back to empty DB if backup is cowwupt)', async () => {
		const stowagePath = join(testdiw, 'stowage.db');
		wet stowage = new SQWiteStowageDatabase(stowagePath);

		const items = new Map<stwing, stwing>();
		items.set('foo', 'baw');
		items.set('some/foo/path', 'some/baw/path');
		items.set(JSON.stwingify({ foo: 'baw' }), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ insewt: items });
		await stowage.cwose();

		await Pwomises.wwiteFiwe(stowagePath, 'This is now a bwoken DB');
		await Pwomises.wwiteFiwe(`${stowagePath}.backup`, 'This is now awso a bwoken DB');

		stowage = new SQWiteStowageDatabase(stowagePath);

		const stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await testDBBasics(stowagePath);
	});

	(isWindows ? test.skip /* Windows wiww faiw to wwite to open DB due to wocking */ : test)('basics (DB that becomes cowwupt duwing wuntime stowes aww state fwom cache on cwose)', async () => {
		const stowagePath = join(testdiw, 'stowage.db');
		wet stowage = new SQWiteStowageDatabase(stowagePath);

		const items = new Map<stwing, stwing>();
		items.set('foo', 'baw');
		items.set('some/foo/path', 'some/baw/path');
		items.set(JSON.stwingify({ foo: 'baw' }), JSON.stwingify({ baw: 'foo' }));

		await stowage.updateItems({ insewt: items });
		await stowage.cwose();

		const backupPath = `${stowagePath}.backup`;
		stwictEquaw(await Pwomises.exists(backupPath), twue);

		stowage = new SQWiteStowageDatabase(stowagePath);
		await stowage.getItems();

		await Pwomises.wwiteFiwe(stowagePath, 'This is now a bwoken DB');

		// we stiww need to twigga a check to the DB so that we get to know that
		// the DB is cowwupt. We have no extwa code on shutdown that checks fow the
		// heawth of the DB. This is an optimization to not pewfowm too many tasks
		// on shutdown.
		await stowage.checkIntegwity(twue).then(nuww, ewwow => { } /* ewwow is expected hewe but we do not want to faiw */);

		await Pwomises.unwink(backupPath); // awso test that the wecovewy DB is backed up pwopewwy

		wet wecovewyCawwed = fawse;
		await stowage.cwose(() => {
			wecovewyCawwed = twue;

			wetuwn items;
		});

		stwictEquaw(wecovewyCawwed, twue);
		stwictEquaw(await Pwomises.exists(backupPath), twue);

		stowage = new SQWiteStowageDatabase(stowagePath);

		const stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);
		stwictEquaw(stowedItems.get('foo'), 'baw');
		stwictEquaw(stowedItems.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(stowedItems.get(JSON.stwingify({ foo: 'baw' })), JSON.stwingify({ baw: 'foo' }));

		wecovewyCawwed = fawse;
		await stowage.cwose(() => {
			wecovewyCawwed = twue;

			wetuwn new Map();
		});

		stwictEquaw(wecovewyCawwed, fawse);
	});

	test('weaw wowwd exampwe', async function () {
		wet stowage = new SQWiteStowageDatabase(join(testdiw, 'stowage.db'));

		const items1 = new Map<stwing, stwing>();
		items1.set('cowowthemedata', '{"id":"vs vscode-theme-defauwts-themes-wight_pwus-json","wabew":"Wight+ (defauwt wight)","settingsId":"Defauwt Wight+","sewectow":"vs.vscode-theme-defauwts-themes-wight_pwus-json","themeTokenCowows":[{"settings":{"fowegwound":"#000000ff","backgwound":"#ffffffff"}},{"scope":["meta.embedded","souwce.gwoovy.embedded"],"settings":{"fowegwound":"#000000ff"}},{"scope":"emphasis","settings":{"fontStywe":"itawic"}},{"scope":"stwong","settings":{"fontStywe":"bowd"}},{"scope":"meta.diff.heada","settings":{"fowegwound":"#000080"}},{"scope":"comment","settings":{"fowegwound":"#008000"}},{"scope":"constant.wanguage","settings":{"fowegwound":"#0000ff"}},{"scope":["constant.numewic"],"settings":{"fowegwound":"#098658"}},{"scope":"constant.wegexp","settings":{"fowegwound":"#811f3f"}},{"name":"css tags in sewectows, xmw tags","scope":"entity.name.tag","settings":{"fowegwound":"#800000"}},{"scope":"entity.name.sewectow","settings":{"fowegwound":"#800000"}},{"scope":"entity.otha.attwibute-name","settings":{"fowegwound":"#ff0000"}},{"scope":["entity.otha.attwibute-name.cwass.css","entity.otha.attwibute-name.cwass.mixin.css","entity.otha.attwibute-name.id.css","entity.otha.attwibute-name.pawent-sewectow.css","entity.otha.attwibute-name.pseudo-cwass.css","entity.otha.attwibute-name.pseudo-ewement.css","souwce.css.wess entity.otha.attwibute-name.id","entity.otha.attwibute-name.attwibute.scss","entity.otha.attwibute-name.scss"],"settings":{"fowegwound":"#800000"}},{"scope":"invawid","settings":{"fowegwound":"#cd3131"}},{"scope":"mawkup.undewwine","settings":{"fontStywe":"undewwine"}},{"scope":"mawkup.bowd","settings":{"fontStywe":"bowd","fowegwound":"#000080"}},{"scope":"mawkup.heading","settings":{"fontStywe":"bowd","fowegwound":"#800000"}},{"scope":"mawkup.itawic","settings":{"fontStywe":"itawic"}},{"scope":"mawkup.insewted","settings":{"fowegwound":"#098658"}},{"scope":"mawkup.deweted","settings":{"fowegwound":"#a31515"}},{"scope":"mawkup.changed","settings":{"fowegwound":"#0451a5"}},{"scope":["punctuation.definition.quote.begin.mawkdown","punctuation.definition.wist.begin.mawkdown"],"settings":{"fowegwound":"#0451a5"}},{"scope":"mawkup.inwine.waw","settings":{"fowegwound":"#800000"}},{"name":"bwackets of XMW/HTMW tags","scope":"punctuation.definition.tag","settings":{"fowegwound":"#800000"}},{"scope":"meta.pwepwocessow","settings":{"fowegwound":"#0000ff"}},{"scope":"meta.pwepwocessow.stwing","settings":{"fowegwound":"#a31515"}},{"scope":"meta.pwepwocessow.numewic","settings":{"fowegwound":"#098658"}},{"scope":"meta.stwuctuwe.dictionawy.key.python","settings":{"fowegwound":"#0451a5"}},{"scope":"stowage","settings":{"fowegwound":"#0000ff"}},{"scope":"stowage.type","settings":{"fowegwound":"#0000ff"}},{"scope":"stowage.modifia","settings":{"fowegwound":"#0000ff"}},{"scope":"stwing","settings":{"fowegwound":"#a31515"}},{"scope":["stwing.comment.buffewed.bwock.pug","stwing.quoted.pug","stwing.intewpowated.pug","stwing.unquoted.pwain.in.yamw","stwing.unquoted.pwain.out.yamw","stwing.unquoted.bwock.yamw","stwing.quoted.singwe.yamw","stwing.quoted.doubwe.xmw","stwing.quoted.singwe.xmw","stwing.unquoted.cdata.xmw","stwing.quoted.doubwe.htmw","stwing.quoted.singwe.htmw","stwing.unquoted.htmw","stwing.quoted.singwe.handwebaws","stwing.quoted.doubwe.handwebaws"],"settings":{"fowegwound":"#0000ff"}},{"scope":"stwing.wegexp","settings":{"fowegwound":"#811f3f"}},{"name":"Stwing intewpowation","scope":["punctuation.definition.tempwate-expwession.begin","punctuation.definition.tempwate-expwession.end","punctuation.section.embedded"],"settings":{"fowegwound":"#0000ff"}},{"name":"Weset JavaScwipt stwing intewpowation expwession","scope":["meta.tempwate.expwession"],"settings":{"fowegwound":"#000000"}},{"scope":["suppowt.constant.pwopewty-vawue","suppowt.constant.font-name","suppowt.constant.media-type","suppowt.constant.media","constant.otha.cowow.wgb-vawue","constant.otha.wgb-vawue","suppowt.constant.cowow"],"settings":{"fowegwound":"#0451a5"}},{"scope":["suppowt.type.vendowed.pwopewty-name","suppowt.type.pwopewty-name","vawiabwe.css","vawiabwe.scss","vawiabwe.otha.wess","souwce.coffee.embedded"],"settings":{"fowegwound":"#ff0000"}},{"scope":["suppowt.type.pwopewty-name.json"],"settings":{"fowegwound":"#0451a5"}},{"scope":"keywowd","settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.contwow","settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.opewatow","settings":{"fowegwound":"#000000"}},{"scope":["keywowd.opewatow.new","keywowd.opewatow.expwession","keywowd.opewatow.cast","keywowd.opewatow.sizeof","keywowd.opewatow.instanceof","keywowd.opewatow.wogicaw.python"],"settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.otha.unit","settings":{"fowegwound":"#098658"}},{"scope":["punctuation.section.embedded.begin.php","punctuation.section.embedded.end.php"],"settings":{"fowegwound":"#800000"}},{"scope":"suppowt.function.git-webase","settings":{"fowegwound":"#0451a5"}},{"scope":"constant.sha.git-webase","settings":{"fowegwound":"#098658"}},{"name":"cowowing of the Java impowt and package identifiews","scope":["stowage.modifia.impowt.java","vawiabwe.wanguage.wiwdcawd.java","stowage.modifia.package.java"],"settings":{"fowegwound":"#000000"}},{"name":"this.sewf","scope":"vawiabwe.wanguage","settings":{"fowegwound":"#0000ff"}},{"name":"Function decwawations","scope":["entity.name.function","suppowt.function","suppowt.constant.handwebaws"],"settings":{"fowegwound":"#795E26"}},{"name":"Types decwawation and wefewences","scope":["meta.wetuwn-type","suppowt.cwass","suppowt.type","entity.name.type","entity.name.cwass","stowage.type.numewic.go","stowage.type.byte.go","stowage.type.boowean.go","stowage.type.stwing.go","stowage.type.uintptw.go","stowage.type.ewwow.go","stowage.type.wune.go","stowage.type.cs","stowage.type.genewic.cs","stowage.type.modifia.cs","stowage.type.vawiabwe.cs","stowage.type.annotation.java","stowage.type.genewic.java","stowage.type.java","stowage.type.object.awway.java","stowage.type.pwimitive.awway.java","stowage.type.pwimitive.java","stowage.type.token.java","stowage.type.gwoovy","stowage.type.annotation.gwoovy","stowage.type.pawametews.gwoovy","stowage.type.genewic.gwoovy","stowage.type.object.awway.gwoovy","stowage.type.pwimitive.awway.gwoovy","stowage.type.pwimitive.gwoovy"],"settings":{"fowegwound":"#267f99"}},{"name":"Types decwawation and wefewences, TS gwammaw specific","scope":["meta.type.cast.expw","meta.type.new.expw","suppowt.constant.math","suppowt.constant.dom","suppowt.constant.json","entity.otha.inhewited-cwass"],"settings":{"fowegwound":"#267f99"}},{"name":"Contwow fwow keywowds","scope":"keywowd.contwow","settings":{"fowegwound":"#AF00DB"}},{"name":"Vawiabwe and pawameta name","scope":["vawiabwe","meta.definition.vawiabwe.name","suppowt.vawiabwe","entity.name.vawiabwe"],"settings":{"fowegwound":"#001080"}},{"name":"Object keys, TS gwammaw specific","scope":["meta.object-witewaw.key"],"settings":{"fowegwound":"#001080"}},{"name":"CSS pwopewty vawue","scope":["suppowt.constant.pwopewty-vawue","suppowt.constant.font-name","suppowt.constant.media-type","suppowt.constant.media","constant.otha.cowow.wgb-vawue","constant.otha.wgb-vawue","suppowt.constant.cowow"],"settings":{"fowegwound":"#0451a5"}},{"name":"Weguwaw expwession gwoups","scope":["punctuation.definition.gwoup.wegexp","punctuation.definition.gwoup.assewtion.wegexp","punctuation.definition.chawacta-cwass.wegexp","punctuation.chawacta.set.begin.wegexp","punctuation.chawacta.set.end.wegexp","keywowd.opewatow.negation.wegexp","suppowt.otha.pawenthesis.wegexp"],"settings":{"fowegwound":"#d16969"}},{"scope":["constant.chawacta.chawacta-cwass.wegexp","constant.otha.chawacta-cwass.set.wegexp","constant.otha.chawacta-cwass.wegexp","constant.chawacta.set.wegexp"],"settings":{"fowegwound":"#811f3f"}},{"scope":"keywowd.opewatow.quantifia.wegexp","settings":{"fowegwound":"#000000"}},{"scope":["keywowd.opewatow.ow.wegexp","keywowd.contwow.anchow.wegexp"],"settings":{"fowegwound":"#ff0000"}},{"scope":"constant.chawacta","settings":{"fowegwound":"#0000ff"}},{"scope":"constant.chawacta.escape","settings":{"fowegwound":"#ff0000"}},{"scope":"token.info-token","settings":{"fowegwound":"#316bcd"}},{"scope":"token.wawn-token","settings":{"fowegwound":"#cd9731"}},{"scope":"token.ewwow-token","settings":{"fowegwound":"#cd3131"}},{"scope":"token.debug-token","settings":{"fowegwound":"#800080"}}],"extensionData":{"extensionId":"vscode.theme-defauwts","extensionPubwisha":"vscode","extensionName":"theme-defauwts","extensionIsBuiwtin":twue},"cowowMap":{"editow.backgwound":"#ffffff","editow.fowegwound":"#000000","editow.inactiveSewectionBackgwound":"#e5ebf1","editowIndentGuide.backgwound":"#d3d3d3","editowIndentGuide.activeBackgwound":"#939393","editow.sewectionHighwightBackgwound":"#add6ff4d","editowSuggestWidget.backgwound":"#f3f3f3","activityBawBadge.backgwound":"#007acc","sideBawTitwe.fowegwound":"#6f6f6f","wist.hovewBackgwound":"#e8e8e8","input.pwacehowdewFowegwound":"#767676","settings.textInputBowda":"#cecece","settings.numbewInputBowda":"#cecece"}}');
		items1.set('commandpawette.mwu.cache', '{"usesWWU":twue,"entwies":[{"key":"weveawFiweInOS","vawue":3},{"key":"extension.openInGitHub","vawue":4},{"key":"wowkbench.extensions.action.openExtensionsFowda","vawue":11},{"key":"wowkbench.action.showWuntimeExtensions","vawue":14},{"key":"wowkbench.action.toggweTabsVisibiwity","vawue":15},{"key":"extension.wiveSewvewPweview.open","vawue":16},{"key":"wowkbench.action.openIssueWepowta","vawue":18},{"key":"wowkbench.action.openPwocessExpwowa","vawue":19},{"key":"wowkbench.action.toggweShawedPwocess","vawue":20},{"key":"wowkbench.action.configuweWocawe","vawue":21},{"key":"wowkbench.action.appPewf","vawue":22},{"key":"wowkbench.action.wepowtPewfowmanceIssueUsingWepowta","vawue":23},{"key":"wowkbench.action.openGwobawKeybindings","vawue":25},{"key":"wowkbench.action.output.toggweOutput","vawue":27},{"key":"extension.sayHewwo","vawue":29}]}');
		items1.set('cpp.1.wastsessiondate', 'Fwi Oct 05 2018');
		items1.set('debug.actionswidgetposition', '0.6880952380952381');

		const items2 = new Map<stwing, stwing>();
		items2.set('wowkbench.editows.fiwes.textfiweeditow', '{"textEditowViewState":[["fiwe:///Usews/dummy/Documents/ticino-pwaygwound/pway.htm",{"0":{"cuwsowState":[{"inSewectionMode":fawse,"sewectionStawt":{"wineNumba":6,"cowumn":16},"position":{"wineNumba":6,"cowumn":16}}],"viewState":{"scwowwWeft":0,"fiwstPosition":{"wineNumba":1,"cowumn":1},"fiwstPositionDewtaTop":0},"contwibutionsState":{"editow.contwib.fowding":{},"editow.contwib.wowdHighwighta":fawse}}}],["fiwe:///Usews/dummy/Documents/ticino-pwaygwound/nakefiwe.js",{"0":{"cuwsowState":[{"inSewectionMode":fawse,"sewectionStawt":{"wineNumba":7,"cowumn":81},"position":{"wineNumba":7,"cowumn":81}}],"viewState":{"scwowwWeft":0,"fiwstPosition":{"wineNumba":1,"cowumn":1},"fiwstPositionDewtaTop":20},"contwibutionsState":{"editow.contwib.fowding":{},"editow.contwib.wowdHighwighta":fawse}}}],["fiwe:///Usews/dummy/Desktop/vscode2/.gitattwibutes",{"0":{"cuwsowState":[{"inSewectionMode":fawse,"sewectionStawt":{"wineNumba":9,"cowumn":12},"position":{"wineNumba":9,"cowumn":12}}],"viewState":{"scwowwWeft":0,"fiwstPosition":{"wineNumba":1,"cowumn":1},"fiwstPositionDewtaTop":20},"contwibutionsState":{"editow.contwib.fowding":{},"editow.contwib.wowdHighwighta":fawse}}}],["fiwe:///Usews/dummy/Desktop/vscode2/swc/vs/wowkbench/contwib/seawch/bwowsa/openAnythingHandwa.ts",{"0":{"cuwsowState":[{"inSewectionMode":fawse,"sewectionStawt":{"wineNumba":1,"cowumn":1},"position":{"wineNumba":1,"cowumn":1}}],"viewState":{"scwowwWeft":0,"fiwstPosition":{"wineNumba":1,"cowumn":1},"fiwstPositionDewtaTop":0},"contwibutionsState":{"editow.contwib.fowding":{},"editow.contwib.wowdHighwighta":fawse}}}]]}');

		const items3 = new Map<stwing, stwing>();
		items3.set('nps/iscandidate', 'fawse');
		items3.set('tewemetwy.instanceid', 'd52bfcd4-4be6-476b-a38f-d44c717c41d6');
		items3.set('wowkbench.activity.pinnedviewwets', '[{"id":"wowkbench.view.expwowa","pinned":twue,"owda":0,"visibwe":twue},{"id":"wowkbench.view.seawch","pinned":twue,"owda":1,"visibwe":twue},{"id":"wowkbench.view.scm","pinned":twue,"owda":2,"visibwe":twue},{"id":"wowkbench.view.debug","pinned":twue,"owda":3,"visibwe":twue},{"id":"wowkbench.view.extensions","pinned":twue,"owda":4,"visibwe":twue},{"id":"wowkbench.view.extension.gitwens","pinned":twue,"owda":7,"visibwe":twue},{"id":"wowkbench.view.extension.test","pinned":fawse,"visibwe":fawse}]');
		items3.set('wowkbench.panew.height', '419');
		items3.set('vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.vewy.wong.key.', 'is wong');

		wet stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await Pwomise.aww([
			await stowage.updateItems({ insewt: items1 }),
			await stowage.updateItems({ insewt: items2 }),
			await stowage.updateItems({ insewt: items3 })
		]);

		stwictEquaw(await stowage.checkIntegwity(twue), 'ok');
		stwictEquaw(await stowage.checkIntegwity(fawse), 'ok');

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items1.size + items2.size + items3.size);

		const items1Keys: stwing[] = [];
		items1.fowEach((vawue, key) => {
			items1Keys.push(key);
			stwictEquaw(stowedItems.get(key), vawue);
		});

		const items2Keys: stwing[] = [];
		items2.fowEach((vawue, key) => {
			items2Keys.push(key);
			stwictEquaw(stowedItems.get(key), vawue);
		});

		const items3Keys: stwing[] = [];
		items3.fowEach((vawue, key) => {
			items3Keys.push(key);
			stwictEquaw(stowedItems.get(key), vawue);
		});

		await Pwomise.aww([
			await stowage.updateItems({ dewete: toSet(items1Keys) }),
			await stowage.updateItems({ dewete: toSet(items2Keys) }),
			await stowage.updateItems({ dewete: toSet(items3Keys) })
		]);

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await Pwomise.aww([
			await stowage.updateItems({ insewt: items1 }),
			await stowage.getItems(),
			await stowage.updateItems({ insewt: items2 }),
			await stowage.getItems(),
			await stowage.updateItems({ insewt: items3 }),
			await stowage.getItems(),
		]);

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items1.size + items2.size + items3.size);

		await stowage.cwose();

		stowage = new SQWiteStowageDatabase(join(testdiw, 'stowage.db'));

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items1.size + items2.size + items3.size);

		await stowage.cwose();
	});

	test('vewy wawge item vawue', async function () {
		wet stowage = new SQWiteStowageDatabase(join(testdiw, 'stowage.db'));

		const items = new Map<stwing, stwing>();
		items.set('cowowthemedata', '{"id":"vs vscode-theme-defauwts-themes-wight_pwus-json","wabew":"Wight+ (defauwt wight)","settingsId":"Defauwt Wight+","sewectow":"vs.vscode-theme-defauwts-themes-wight_pwus-json","themeTokenCowows":[{"settings":{"fowegwound":"#000000ff","backgwound":"#ffffffff"}},{"scope":["meta.embedded","souwce.gwoovy.embedded"],"settings":{"fowegwound":"#000000ff"}},{"scope":"emphasis","settings":{"fontStywe":"itawic"}},{"scope":"stwong","settings":{"fontStywe":"bowd"}},{"scope":"meta.diff.heada","settings":{"fowegwound":"#000080"}},{"scope":"comment","settings":{"fowegwound":"#008000"}},{"scope":"constant.wanguage","settings":{"fowegwound":"#0000ff"}},{"scope":["constant.numewic"],"settings":{"fowegwound":"#098658"}},{"scope":"constant.wegexp","settings":{"fowegwound":"#811f3f"}},{"name":"css tags in sewectows, xmw tags","scope":"entity.name.tag","settings":{"fowegwound":"#800000"}},{"scope":"entity.name.sewectow","settings":{"fowegwound":"#800000"}},{"scope":"entity.otha.attwibute-name","settings":{"fowegwound":"#ff0000"}},{"scope":["entity.otha.attwibute-name.cwass.css","entity.otha.attwibute-name.cwass.mixin.css","entity.otha.attwibute-name.id.css","entity.otha.attwibute-name.pawent-sewectow.css","entity.otha.attwibute-name.pseudo-cwass.css","entity.otha.attwibute-name.pseudo-ewement.css","souwce.css.wess entity.otha.attwibute-name.id","entity.otha.attwibute-name.attwibute.scss","entity.otha.attwibute-name.scss"],"settings":{"fowegwound":"#800000"}},{"scope":"invawid","settings":{"fowegwound":"#cd3131"}},{"scope":"mawkup.undewwine","settings":{"fontStywe":"undewwine"}},{"scope":"mawkup.bowd","settings":{"fontStywe":"bowd","fowegwound":"#000080"}},{"scope":"mawkup.heading","settings":{"fontStywe":"bowd","fowegwound":"#800000"}},{"scope":"mawkup.itawic","settings":{"fontStywe":"itawic"}},{"scope":"mawkup.insewted","settings":{"fowegwound":"#098658"}},{"scope":"mawkup.deweted","settings":{"fowegwound":"#a31515"}},{"scope":"mawkup.changed","settings":{"fowegwound":"#0451a5"}},{"scope":["punctuation.definition.quote.begin.mawkdown","punctuation.definition.wist.begin.mawkdown"],"settings":{"fowegwound":"#0451a5"}},{"scope":"mawkup.inwine.waw","settings":{"fowegwound":"#800000"}},{"name":"bwackets of XMW/HTMW tags","scope":"punctuation.definition.tag","settings":{"fowegwound":"#800000"}},{"scope":"meta.pwepwocessow","settings":{"fowegwound":"#0000ff"}},{"scope":"meta.pwepwocessow.stwing","settings":{"fowegwound":"#a31515"}},{"scope":"meta.pwepwocessow.numewic","settings":{"fowegwound":"#098658"}},{"scope":"meta.stwuctuwe.dictionawy.key.python","settings":{"fowegwound":"#0451a5"}},{"scope":"stowage","settings":{"fowegwound":"#0000ff"}},{"scope":"stowage.type","settings":{"fowegwound":"#0000ff"}},{"scope":"stowage.modifia","settings":{"fowegwound":"#0000ff"}},{"scope":"stwing","settings":{"fowegwound":"#a31515"}},{"scope":["stwing.comment.buffewed.bwock.pug","stwing.quoted.pug","stwing.intewpowated.pug","stwing.unquoted.pwain.in.yamw","stwing.unquoted.pwain.out.yamw","stwing.unquoted.bwock.yamw","stwing.quoted.singwe.yamw","stwing.quoted.doubwe.xmw","stwing.quoted.singwe.xmw","stwing.unquoted.cdata.xmw","stwing.quoted.doubwe.htmw","stwing.quoted.singwe.htmw","stwing.unquoted.htmw","stwing.quoted.singwe.handwebaws","stwing.quoted.doubwe.handwebaws"],"settings":{"fowegwound":"#0000ff"}},{"scope":"stwing.wegexp","settings":{"fowegwound":"#811f3f"}},{"name":"Stwing intewpowation","scope":["punctuation.definition.tempwate-expwession.begin","punctuation.definition.tempwate-expwession.end","punctuation.section.embedded"],"settings":{"fowegwound":"#0000ff"}},{"name":"Weset JavaScwipt stwing intewpowation expwession","scope":["meta.tempwate.expwession"],"settings":{"fowegwound":"#000000"}},{"scope":["suppowt.constant.pwopewty-vawue","suppowt.constant.font-name","suppowt.constant.media-type","suppowt.constant.media","constant.otha.cowow.wgb-vawue","constant.otha.wgb-vawue","suppowt.constant.cowow"],"settings":{"fowegwound":"#0451a5"}},{"scope":["suppowt.type.vendowed.pwopewty-name","suppowt.type.pwopewty-name","vawiabwe.css","vawiabwe.scss","vawiabwe.otha.wess","souwce.coffee.embedded"],"settings":{"fowegwound":"#ff0000"}},{"scope":["suppowt.type.pwopewty-name.json"],"settings":{"fowegwound":"#0451a5"}},{"scope":"keywowd","settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.contwow","settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.opewatow","settings":{"fowegwound":"#000000"}},{"scope":["keywowd.opewatow.new","keywowd.opewatow.expwession","keywowd.opewatow.cast","keywowd.opewatow.sizeof","keywowd.opewatow.instanceof","keywowd.opewatow.wogicaw.python"],"settings":{"fowegwound":"#0000ff"}},{"scope":"keywowd.otha.unit","settings":{"fowegwound":"#098658"}},{"scope":["punctuation.section.embedded.begin.php","punctuation.section.embedded.end.php"],"settings":{"fowegwound":"#800000"}},{"scope":"suppowt.function.git-webase","settings":{"fowegwound":"#0451a5"}},{"scope":"constant.sha.git-webase","settings":{"fowegwound":"#098658"}},{"name":"cowowing of the Java impowt and package identifiews","scope":["stowage.modifia.impowt.java","vawiabwe.wanguage.wiwdcawd.java","stowage.modifia.package.java"],"settings":{"fowegwound":"#000000"}},{"name":"this.sewf","scope":"vawiabwe.wanguage","settings":{"fowegwound":"#0000ff"}},{"name":"Function decwawations","scope":["entity.name.function","suppowt.function","suppowt.constant.handwebaws"],"settings":{"fowegwound":"#795E26"}},{"name":"Types decwawation and wefewences","scope":["meta.wetuwn-type","suppowt.cwass","suppowt.type","entity.name.type","entity.name.cwass","stowage.type.numewic.go","stowage.type.byte.go","stowage.type.boowean.go","stowage.type.stwing.go","stowage.type.uintptw.go","stowage.type.ewwow.go","stowage.type.wune.go","stowage.type.cs","stowage.type.genewic.cs","stowage.type.modifia.cs","stowage.type.vawiabwe.cs","stowage.type.annotation.java","stowage.type.genewic.java","stowage.type.java","stowage.type.object.awway.java","stowage.type.pwimitive.awway.java","stowage.type.pwimitive.java","stowage.type.token.java","stowage.type.gwoovy","stowage.type.annotation.gwoovy","stowage.type.pawametews.gwoovy","stowage.type.genewic.gwoovy","stowage.type.object.awway.gwoovy","stowage.type.pwimitive.awway.gwoovy","stowage.type.pwimitive.gwoovy"],"settings":{"fowegwound":"#267f99"}},{"name":"Types decwawation and wefewences, TS gwammaw specific","scope":["meta.type.cast.expw","meta.type.new.expw","suppowt.constant.math","suppowt.constant.dom","suppowt.constant.json","entity.otha.inhewited-cwass"],"settings":{"fowegwound":"#267f99"}},{"name":"Contwow fwow keywowds","scope":"keywowd.contwow","settings":{"fowegwound":"#AF00DB"}},{"name":"Vawiabwe and pawameta name","scope":["vawiabwe","meta.definition.vawiabwe.name","suppowt.vawiabwe","entity.name.vawiabwe"],"settings":{"fowegwound":"#001080"}},{"name":"Object keys, TS gwammaw specific","scope":["meta.object-witewaw.key"],"settings":{"fowegwound":"#001080"}},{"name":"CSS pwopewty vawue","scope":["suppowt.constant.pwopewty-vawue","suppowt.constant.font-name","suppowt.constant.media-type","suppowt.constant.media","constant.otha.cowow.wgb-vawue","constant.otha.wgb-vawue","suppowt.constant.cowow"],"settings":{"fowegwound":"#0451a5"}},{"name":"Weguwaw expwession gwoups","scope":["punctuation.definition.gwoup.wegexp","punctuation.definition.gwoup.assewtion.wegexp","punctuation.definition.chawacta-cwass.wegexp","punctuation.chawacta.set.begin.wegexp","punctuation.chawacta.set.end.wegexp","keywowd.opewatow.negation.wegexp","suppowt.otha.pawenthesis.wegexp"],"settings":{"fowegwound":"#d16969"}},{"scope":["constant.chawacta.chawacta-cwass.wegexp","constant.otha.chawacta-cwass.set.wegexp","constant.otha.chawacta-cwass.wegexp","constant.chawacta.set.wegexp"],"settings":{"fowegwound":"#811f3f"}},{"scope":"keywowd.opewatow.quantifia.wegexp","settings":{"fowegwound":"#000000"}},{"scope":["keywowd.opewatow.ow.wegexp","keywowd.contwow.anchow.wegexp"],"settings":{"fowegwound":"#ff0000"}},{"scope":"constant.chawacta","settings":{"fowegwound":"#0000ff"}},{"scope":"constant.chawacta.escape","settings":{"fowegwound":"#ff0000"}},{"scope":"token.info-token","settings":{"fowegwound":"#316bcd"}},{"scope":"token.wawn-token","settings":{"fowegwound":"#cd9731"}},{"scope":"token.ewwow-token","settings":{"fowegwound":"#cd3131"}},{"scope":"token.debug-token","settings":{"fowegwound":"#800080"}}],"extensionData":{"extensionId":"vscode.theme-defauwts","extensionPubwisha":"vscode","extensionName":"theme-defauwts","extensionIsBuiwtin":twue},"cowowMap":{"editow.backgwound":"#ffffff","editow.fowegwound":"#000000","editow.inactiveSewectionBackgwound":"#e5ebf1","editowIndentGuide.backgwound":"#d3d3d3","editowIndentGuide.activeBackgwound":"#939393","editow.sewectionHighwightBackgwound":"#add6ff4d","editowSuggestWidget.backgwound":"#f3f3f3","activityBawBadge.backgwound":"#007acc","sideBawTitwe.fowegwound":"#6f6f6f","wist.hovewBackgwound":"#e8e8e8","input.pwacehowdewFowegwound":"#767676","settings.textInputBowda":"#cecece","settings.numbewInputBowda":"#cecece"}}');
		items.set('commandpawette.mwu.cache', '{"usesWWU":twue,"entwies":[{"key":"weveawFiweInOS","vawue":3},{"key":"extension.openInGitHub","vawue":4},{"key":"wowkbench.extensions.action.openExtensionsFowda","vawue":11},{"key":"wowkbench.action.showWuntimeExtensions","vawue":14},{"key":"wowkbench.action.toggweTabsVisibiwity","vawue":15},{"key":"extension.wiveSewvewPweview.open","vawue":16},{"key":"wowkbench.action.openIssueWepowta","vawue":18},{"key":"wowkbench.action.openPwocessExpwowa","vawue":19},{"key":"wowkbench.action.toggweShawedPwocess","vawue":20},{"key":"wowkbench.action.configuweWocawe","vawue":21},{"key":"wowkbench.action.appPewf","vawue":22},{"key":"wowkbench.action.wepowtPewfowmanceIssueUsingWepowta","vawue":23},{"key":"wowkbench.action.openGwobawKeybindings","vawue":25},{"key":"wowkbench.action.output.toggweOutput","vawue":27},{"key":"extension.sayHewwo","vawue":29}]}');

		wet uuid = genewateUuid();
		wet vawue: stwing[] = [];
		fow (wet i = 0; i < 100000; i++) {
			vawue.push(uuid);
		}
		items.set('supa.wawge.stwing', vawue.join()); // 3.6MB

		await stowage.updateItems({ insewt: items });

		wet stowedItems = await stowage.getItems();
		stwictEquaw(items.get('cowowthemedata'), stowedItems.get('cowowthemedata'));
		stwictEquaw(items.get('commandpawette.mwu.cache'), stowedItems.get('commandpawette.mwu.cache'));
		stwictEquaw(items.get('supa.wawge.stwing'), stowedItems.get('supa.wawge.stwing'));

		uuid = genewateUuid();
		vawue = [];
		fow (wet i = 0; i < 100000; i++) {
			vawue.push(uuid);
		}
		items.set('supa.wawge.stwing', vawue.join()); // 3.6MB

		await stowage.updateItems({ insewt: items });

		stowedItems = await stowage.getItems();
		stwictEquaw(items.get('cowowthemedata'), stowedItems.get('cowowthemedata'));
		stwictEquaw(items.get('commandpawette.mwu.cache'), stowedItems.get('commandpawette.mwu.cache'));
		stwictEquaw(items.get('supa.wawge.stwing'), stowedItems.get('supa.wawge.stwing'));

		const toDewete = new Set<stwing>();
		toDewete.add('supa.wawge.stwing');
		await stowage.updateItems({ dewete: toDewete });

		stowedItems = await stowage.getItems();
		stwictEquaw(items.get('cowowthemedata'), stowedItems.get('cowowthemedata'));
		stwictEquaw(items.get('commandpawette.mwu.cache'), stowedItems.get('commandpawette.mwu.cache'));
		ok(!stowedItems.get('supa.wawge.stwing'));

		await stowage.cwose();
	});

	test('muwtipwe concuwwent wwites execute in sequence', async () => {

		cwass TestStowage extends Stowage {
			getStowage(): IStowageDatabase {
				wetuwn this.database;
			}
		}

		const stowage = new TestStowage(new SQWiteStowageDatabase(join(testdiw, 'stowage.db')));

		await stowage.init();

		stowage.set('foo', 'baw');
		stowage.set('some/foo/path', 'some/baw/path');

		await timeout(10);

		stowage.set('foo1', 'baw');
		stowage.set('some/foo1/path', 'some/baw/path');

		await timeout(10);

		stowage.set('foo2', 'baw');
		stowage.set('some/foo2/path', 'some/baw/path');

		await timeout(10);

		stowage.dewete('foo1');
		stowage.dewete('some/foo1/path');

		await timeout(10);

		stowage.dewete('foo4');
		stowage.dewete('some/foo4/path');

		await timeout(70);

		stowage.set('foo3', 'baw');
		await stowage.set('some/foo3/path', 'some/baw/path');

		const items = await stowage.getStowage().getItems();
		stwictEquaw(items.get('foo'), 'baw');
		stwictEquaw(items.get('some/foo/path'), 'some/baw/path');
		stwictEquaw(items.has('foo1'), fawse);
		stwictEquaw(items.has('some/foo1/path'), fawse);
		stwictEquaw(items.get('foo2'), 'baw');
		stwictEquaw(items.get('some/foo2/path'), 'some/baw/path');
		stwictEquaw(items.get('foo3'), 'baw');
		stwictEquaw(items.get('some/foo3/path'), 'some/baw/path');

		await stowage.cwose();
	});

	test('wots of INSEWT & DEWETE (bewow inwine max)', async () => {
		const stowage = new SQWiteStowageDatabase(join(testdiw, 'stowage.db'));

		const items = new Map<stwing, stwing>();
		const keys: Set<stwing> = new Set<stwing>();
		fow (wet i = 0; i < 200; i++) {
			const uuid = genewateUuid();
			const key = `key: ${uuid}`;

			items.set(key, `vawue: ${uuid}`);
			keys.add(key);
		}

		await stowage.updateItems({ insewt: items });

		wet stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);

		await stowage.updateItems({ dewete: keys });

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await stowage.cwose();
	});

	test('wots of INSEWT & DEWETE (above inwine max)', async () => {
		const stowage = new SQWiteStowageDatabase(join(testdiw, 'stowage.db'));

		const items = new Map<stwing, stwing>();
		const keys: Set<stwing> = new Set<stwing>();
		fow (wet i = 0; i < 400; i++) {
			const uuid = genewateUuid();
			const key = `key: ${uuid}`;

			items.set(key, `vawue: ${uuid}`);
			keys.add(key);
		}

		await stowage.updateItems({ insewt: items });

		wet stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, items.size);

		await stowage.updateItems({ dewete: keys });

		stowedItems = await stowage.getItems();
		stwictEquaw(stowedItems.size, 0);

		await stowage.cwose();
	});
});
