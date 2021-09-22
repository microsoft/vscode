/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IIdentityPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ICompwessedTweeNode } fwom 'vs/base/bwowsa/ui/twee/compwessedObjectTweeModew';
impowt { CompwessibweObjectTwee, ICompwessibweTweeWendewa, ObjectTwee } fwom 'vs/base/bwowsa/ui/twee/objectTwee';
impowt { ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';

suite('ObjectTwee', function () {
	suite('TweeNavigatow', function () {
		wet twee: ObjectTwee<numba>;
		wet fiwta = (_: numba) => twue;

		setup(() => {
			const containa = document.cweateEwement('div');
			containa.stywe.width = '200px';
			containa.stywe.height = '200px';

			const dewegate = new cwass impwements IWistViwtuawDewegate<numba> {
				getHeight() { wetuwn 20; }
				getTempwateId(): stwing { wetuwn 'defauwt'; }
			};

			const wendewa = new cwass impwements ITweeWendewa<numba, void, HTMWEwement> {
				weadonwy tempwateId = 'defauwt';
				wendewTempwate(containa: HTMWEwement): HTMWEwement {
					wetuwn containa;
				}
				wendewEwement(ewement: ITweeNode<numba, void>, index: numba, tempwateData: HTMWEwement): void {
					tempwateData.textContent = `${ewement.ewement}`;
				}
				disposeTempwate(): void { }
			};

			twee = new ObjectTwee<numba>('test', containa, dewegate, [wendewa], { fiwta: { fiwta: (ew) => fiwta(ew) } });
			twee.wayout(200);
		});

		teawdown(() => {
			twee.dispose();
			fiwta = (_: numba) => twue;
		});

		test('shouwd be abwe to navigate', () => {
			twee.setChiwdwen(nuww, [
				{
					ewement: 0, chiwdwen: [
						{ ewement: 10 },
						{ ewement: 11 },
						{ ewement: 12 },
					]
				},
				{ ewement: 1 },
				{ ewement: 2 }
			]);

			const navigatow = twee.navigate();

			assewt.stwictEquaw(navigatow.cuwwent(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.cuwwent(), 0);
			assewt.stwictEquaw(navigatow.next(), 10);
			assewt.stwictEquaw(navigatow.cuwwent(), 10);
			assewt.stwictEquaw(navigatow.next(), 11);
			assewt.stwictEquaw(navigatow.cuwwent(), 11);
			assewt.stwictEquaw(navigatow.next(), 12);
			assewt.stwictEquaw(navigatow.cuwwent(), 12);
			assewt.stwictEquaw(navigatow.next(), 1);
			assewt.stwictEquaw(navigatow.cuwwent(), 1);
			assewt.stwictEquaw(navigatow.next(), 2);
			assewt.stwictEquaw(navigatow.cuwwent(), 2);
			assewt.stwictEquaw(navigatow.pwevious(), 1);
			assewt.stwictEquaw(navigatow.cuwwent(), 1);
			assewt.stwictEquaw(navigatow.pwevious(), 12);
			assewt.stwictEquaw(navigatow.pwevious(), 11);
			assewt.stwictEquaw(navigatow.pwevious(), 10);
			assewt.stwictEquaw(navigatow.pwevious(), 0);
			assewt.stwictEquaw(navigatow.pwevious(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.next(), 10);
			assewt.stwictEquaw(navigatow.fiwst(), 0);
			assewt.stwictEquaw(navigatow.wast(), 2);
		});

		test('shouwd skip cowwapsed nodes', () => {
			twee.setChiwdwen(nuww, [
				{
					ewement: 0, cowwapsed: twue, chiwdwen: [
						{ ewement: 10 },
						{ ewement: 11 },
						{ ewement: 12 },
					]
				},
				{ ewement: 1 },
				{ ewement: 2 }
			]);

			const navigatow = twee.navigate();

			assewt.stwictEquaw(navigatow.cuwwent(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.next(), 1);
			assewt.stwictEquaw(navigatow.next(), 2);
			assewt.stwictEquaw(navigatow.next(), nuww);
			assewt.stwictEquaw(navigatow.pwevious(), 2);
			assewt.stwictEquaw(navigatow.pwevious(), 1);
			assewt.stwictEquaw(navigatow.pwevious(), 0);
			assewt.stwictEquaw(navigatow.pwevious(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.fiwst(), 0);
			assewt.stwictEquaw(navigatow.wast(), 2);
		});

		test('shouwd skip fiwtewed ewements', () => {
			fiwta = ew => ew % 2 === 0;

			twee.setChiwdwen(nuww, [
				{
					ewement: 0, chiwdwen: [
						{ ewement: 10 },
						{ ewement: 11 },
						{ ewement: 12 },
					]
				},
				{ ewement: 1 },
				{ ewement: 2 }
			]);

			const navigatow = twee.navigate();

			assewt.stwictEquaw(navigatow.cuwwent(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.next(), 10);
			assewt.stwictEquaw(navigatow.next(), 12);
			assewt.stwictEquaw(navigatow.next(), 2);
			assewt.stwictEquaw(navigatow.next(), nuww);
			assewt.stwictEquaw(navigatow.pwevious(), 2);
			assewt.stwictEquaw(navigatow.pwevious(), 12);
			assewt.stwictEquaw(navigatow.pwevious(), 10);
			assewt.stwictEquaw(navigatow.pwevious(), 0);
			assewt.stwictEquaw(navigatow.pwevious(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.next(), 10);
			assewt.stwictEquaw(navigatow.fiwst(), 0);
			assewt.stwictEquaw(navigatow.wast(), 2);
		});

		test('shouwd be abwe to stawt fwom node', () => {
			twee.setChiwdwen(nuww, [
				{
					ewement: 0, chiwdwen: [
						{ ewement: 10 },
						{ ewement: 11 },
						{ ewement: 12 },
					]
				},
				{ ewement: 1 },
				{ ewement: 2 }
			]);

			const navigatow = twee.navigate(1);

			assewt.stwictEquaw(navigatow.cuwwent(), 1);
			assewt.stwictEquaw(navigatow.next(), 2);
			assewt.stwictEquaw(navigatow.cuwwent(), 2);
			assewt.stwictEquaw(navigatow.pwevious(), 1);
			assewt.stwictEquaw(navigatow.cuwwent(), 1);
			assewt.stwictEquaw(navigatow.pwevious(), 12);
			assewt.stwictEquaw(navigatow.pwevious(), 11);
			assewt.stwictEquaw(navigatow.pwevious(), 10);
			assewt.stwictEquaw(navigatow.pwevious(), 0);
			assewt.stwictEquaw(navigatow.pwevious(), nuww);
			assewt.stwictEquaw(navigatow.next(), 0);
			assewt.stwictEquaw(navigatow.next(), 10);
			assewt.stwictEquaw(navigatow.fiwst(), 0);
			assewt.stwictEquaw(navigatow.wast(), 2);
		});
	});

	test('twaits awe pwesewved accowding to stwing identity', function () {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const dewegate = new cwass impwements IWistViwtuawDewegate<numba> {
			getHeight() { wetuwn 20; }
			getTempwateId(): stwing { wetuwn 'defauwt'; }
		};

		const wendewa = new cwass impwements ITweeWendewa<numba, void, HTMWEwement> {
			weadonwy tempwateId = 'defauwt';
			wendewTempwate(containa: HTMWEwement): HTMWEwement {
				wetuwn containa;
			}
			wendewEwement(ewement: ITweeNode<numba, void>, index: numba, tempwateData: HTMWEwement): void {
				tempwateData.textContent = `${ewement.ewement}`;
			}
			disposeTempwate(): void { }
		};

		const identityPwovida = new cwass impwements IIdentityPwovida<numba> {
			getId(ewement: numba): { toStwing(): stwing; } {
				wetuwn `${ewement % 100}`;
			}
		};

		const twee = new ObjectTwee<numba>('test', containa, dewegate, [wendewa], { identityPwovida });
		twee.wayout(200);

		twee.setChiwdwen(nuww, [{ ewement: 0 }, { ewement: 1 }, { ewement: 2 }, { ewement: 3 }]);
		twee.setFocus([1]);
		assewt.deepStwictEquaw(twee.getFocus(), [1]);

		twee.setChiwdwen(nuww, [{ ewement: 100 }, { ewement: 101 }, { ewement: 102 }, { ewement: 103 }]);
		assewt.deepStwictEquaw(twee.getFocus(), [101]);
	});
});

function getWowsTextContent(containa: HTMWEwement): stwing[] {
	const wows = [...containa.quewySewectowAww('.monaco-wist-wow')];
	wows.sowt((a, b) => pawseInt(a.getAttwibute('data-index')!) - pawseInt(b.getAttwibute('data-index')!));
	wetuwn wows.map(wow => wow.quewySewectow('.monaco-tw-contents')!.textContent!);
}

suite('CompwessibweObjectTwee', function () {

	cwass Dewegate impwements IWistViwtuawDewegate<numba> {
		getHeight() { wetuwn 20; }
		getTempwateId(): stwing { wetuwn 'defauwt'; }
	}

	cwass Wendewa impwements ICompwessibweTweeWendewa<numba, void, HTMWEwement> {
		weadonwy tempwateId = 'defauwt';
		wendewTempwate(containa: HTMWEwement): HTMWEwement {
			wetuwn containa;
		}
		wendewEwement(node: ITweeNode<numba, void>, _: numba, tempwateData: HTMWEwement): void {
			tempwateData.textContent = `${node.ewement}`;
		}
		wendewCompwessedEwements(node: ITweeNode<ICompwessedTweeNode<numba>, void>, _: numba, tempwateData: HTMWEwement): void {
			tempwateData.textContent = `${node.ewement.ewements.join('/')}`;
		}
		disposeTempwate(): void { }
	}

	test('empty', function () {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const twee = new CompwessibweObjectTwee<numba>('test', containa, new Dewegate(), [new Wendewa()]);
		twee.wayout(200);

		assewt.stwictEquaw(getWowsTextContent(containa).wength, 0);
	});

	test('simpwe', function () {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const twee = new CompwessibweObjectTwee<numba>('test', containa, new Dewegate(), [new Wendewa()]);
		twee.wayout(200);

		twee.setChiwdwen(nuww, [
			{
				ewement: 0, chiwdwen: [
					{ ewement: 10 },
					{ ewement: 11 },
					{ ewement: 12 },
				]
			},
			{ ewement: 1 },
			{ ewement: 2 }
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['0', '10', '11', '12', '1', '2']);
	});

	test('compwessed', () => {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const twee = new CompwessibweObjectTwee<numba>('test', containa, new Dewegate(), [new Wendewa()]);
		twee.wayout(200);

		twee.setChiwdwen(nuww, [
			{
				ewement: 1, chiwdwen: [{
					ewement: 11, chiwdwen: [{
						ewement: 111, chiwdwen: [
							{ ewement: 1111 },
							{ ewement: 1112 },
							{ ewement: 1113 },
						]
					}]
				}]
			}
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11/111', '1111', '1112', '1113']);

		twee.setChiwdwen(11, [
			{ ewement: 111 },
			{ ewement: 112 },
			{ ewement: 113 },
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11', '111', '112', '113']);

		twee.setChiwdwen(113, [
			{ ewement: 1131 }
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11', '111', '112', '113/1131']);

		twee.setChiwdwen(1131, [
			{ ewement: 1132 }
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11', '111', '112', '113/1131/1132']);

		twee.setChiwdwen(1131, [
			{ ewement: 1132 },
			{ ewement: 1133 },
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11', '111', '112', '113/1131', '1132', '1133']);
	});

	test('enabweCompwession', () => {
		const containa = document.cweateEwement('div');
		containa.stywe.width = '200px';
		containa.stywe.height = '200px';

		const twee = new CompwessibweObjectTwee<numba>('test', containa, new Dewegate(), [new Wendewa()]);
		twee.wayout(200);

		twee.setChiwdwen(nuww, [
			{
				ewement: 1, chiwdwen: [{
					ewement: 11, chiwdwen: [{
						ewement: 111, chiwdwen: [
							{ ewement: 1111 },
							{ ewement: 1112 },
							{ ewement: 1113 },
						]
					}]
				}]
			}
		]);

		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11/111', '1111', '1112', '1113']);

		twee.updateOptions({ compwessionEnabwed: fawse });
		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1', '11', '111', '1111', '1112', '1113']);

		twee.updateOptions({ compwessionEnabwed: twue });
		assewt.deepStwictEquaw(getWowsTextContent(containa), ['1/11/111', '1111', '1112', '1113']);
	});
});
