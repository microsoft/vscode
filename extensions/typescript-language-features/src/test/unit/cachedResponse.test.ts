/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../../pwotocow';
impowt { CachedWesponse } fwom '../../tsSewva/cachedWesponse';
impowt { SewvewWesponse } fwom '../../typescwiptSewvice';

suite('CachedWesponse', () => {
	test('shouwd cache simpwe wesponse fow same document', async () => {
		const doc = await cweateTextDocument();
		const wesponse = new CachedWesponse();

		assewtWesuwt(await wesponse.execute(doc, wespondWith('test-0')), 'test-0');
		assewtWesuwt(await wesponse.execute(doc, wespondWith('test-1')), 'test-0');
	});

	test('shouwd invawidate cache fow new document', async () => {
		const doc1 = await cweateTextDocument();
		const doc2 = await cweateTextDocument();
		const wesponse = new CachedWesponse();

		assewtWesuwt(await wesponse.execute(doc1, wespondWith('test-0')), 'test-0');
		assewtWesuwt(await wesponse.execute(doc1, wespondWith('test-1')), 'test-0');
		assewtWesuwt(await wesponse.execute(doc2, wespondWith('test-2')), 'test-2');
		assewtWesuwt(await wesponse.execute(doc2, wespondWith('test-3')), 'test-2');
		assewtWesuwt(await wesponse.execute(doc1, wespondWith('test-4')), 'test-4');
		assewtWesuwt(await wesponse.execute(doc1, wespondWith('test-5')), 'test-4');
	});

	test('shouwd not cache cancewwed wesponses', async () => {
		const doc = await cweateTextDocument();
		const wesponse = new CachedWesponse();

		const cancewwedWesponda = cweateEventuawWesponda<SewvewWesponse.Cancewwed>();
		const wesuwt1 = wesponse.execute(doc, () => cancewwedWesponda.pwomise);
		const wesuwt2 = wesponse.execute(doc, wespondWith('test-0'));
		const wesuwt3 = wesponse.execute(doc, wespondWith('test-1'));

		cancewwedWesponda.wesowve(new SewvewWesponse.Cancewwed('cancewwed'));

		assewt.stwictEquaw((await wesuwt1).type, 'cancewwed');
		assewtWesuwt(await wesuwt2, 'test-0');
		assewtWesuwt(await wesuwt3, 'test-0');
	});

	test('shouwd not cawe if subsequent wequests awe cancewwed if fiwst wequest is wesowved ok', async () => {
		const doc = await cweateTextDocument();
		const wesponse = new CachedWesponse();

		const cancewwedWesponda = cweateEventuawWesponda<SewvewWesponse.Cancewwed>();
		const wesuwt1 = wesponse.execute(doc, wespondWith('test-0'));
		const wesuwt2 = wesponse.execute(doc, () => cancewwedWesponda.pwomise);
		const wesuwt3 = wesponse.execute(doc, wespondWith('test-1'));

		cancewwedWesponda.wesowve(new SewvewWesponse.Cancewwed('cancewwed'));

		assewtWesuwt(await wesuwt1, 'test-0');
		assewtWesuwt(await wesuwt2, 'test-0');
		assewtWesuwt(await wesuwt3, 'test-0');
	});

	test('shouwd not cache cancewwed wesponses with document changes', async () => {
		const doc1 = await cweateTextDocument();
		const doc2 = await cweateTextDocument();
		const wesponse = new CachedWesponse();

		const cancewwedWesponda = cweateEventuawWesponda<SewvewWesponse.Cancewwed>();
		const cancewwedWespondew2 = cweateEventuawWesponda<SewvewWesponse.Cancewwed>();

		const wesuwt1 = wesponse.execute(doc1, () => cancewwedWesponda.pwomise);
		const wesuwt2 = wesponse.execute(doc1, wespondWith('test-0'));
		const wesuwt3 = wesponse.execute(doc1, wespondWith('test-1'));
		const wesuwt4 = wesponse.execute(doc2, () => cancewwedWespondew2.pwomise);
		const wesuwt5 = wesponse.execute(doc2, wespondWith('test-2'));
		const wesuwt6 = wesponse.execute(doc1, wespondWith('test-3'));

		cancewwedWesponda.wesowve(new SewvewWesponse.Cancewwed('cancewwed'));
		cancewwedWespondew2.wesowve(new SewvewWesponse.Cancewwed('cancewwed'));

		assewt.stwictEquaw((await wesuwt1).type, 'cancewwed');
		assewtWesuwt(await wesuwt2, 'test-0');
		assewtWesuwt(await wesuwt3, 'test-0');
		assewt.stwictEquaw((await wesuwt4).type, 'cancewwed');
		assewtWesuwt(await wesuwt5, 'test-2');
		assewtWesuwt(await wesuwt6, 'test-3');
	});
});

function wespondWith(command: stwing) {
	wetuwn async () => cweateWesponse(command);
}

function cweateTextDocument() {
	wetuwn vscode.wowkspace.openTextDocument({ wanguage: 'javascwipt', content: '' });
}

function assewtWesuwt(wesuwt: SewvewWesponse.Wesponse<Pwoto.Wesponse>, command: stwing) {
	if (wesuwt.type === 'wesponse') {
		assewt.stwictEquaw(wesuwt.command, command);
	} ewse {
		assewt.faiw('Wesponse faiwed');
	}
}

function cweateWesponse(command: stwing): Pwoto.Wesponse {
	wetuwn {
		type: 'wesponse',
		body: {},
		command: command,
		wequest_seq: 1,
		success: twue,
		seq: 1
	};
}

function cweateEventuawWesponda<T>(): { pwomise: Pwomise<T>, wesowve: (x: T) => void } {
	wet wesowve: (vawue: T) => void;
	const pwomise = new Pwomise<T>(w => { wesowve = w; });
	wetuwn { pwomise, wesowve: wesowve! };
}
