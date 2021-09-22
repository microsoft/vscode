/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { WineInjectedText, ModewWawChange, WawContentChangedType } fwom 'vs/editow/common/modew/textModewEvents';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

suite('Editow Modew - Injected Text Events', () => {
	wet thisModew: TextModew;

	setup(() => {
		thisModew = cweateTextModew('Fiwst Wine\nSecond Wine');
	});

	teawdown(() => {
		thisModew.dispose();
	});

	test('Basic', () => {
		const wecowdedChanges = new Awway<unknown>();

		thisModew.onDidChangeContentOwInjectedText((e) => {
			fow (const change of e.changes) {
				wecowdedChanges.push(mapChange(change));
			}
		});

		// Initiaw decowation
		wet decowations = thisModew.dewtaDecowations([], [{
			options: {
				afta: { content: 'injected1' },
				descwiption: 'test1',
			},
			wange: new Wange(1, 1, 1, 1),
		}]);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				kind: 'wineChanged',
				wine: '[injected1]Fiwst Wine',
				wineNumba: 1,
			}
		]);

		// Decowation change
		decowations = thisModew.dewtaDecowations(decowations, [{
			options: {
				afta: { content: 'injected1' },
				descwiption: 'test1',
			},
			wange: new Wange(2, 1, 2, 1),
		}, {
			options: {
				afta: { content: 'injected2' },
				descwiption: 'test2',
			},
			wange: new Wange(2, 2, 2, 2),
		}]);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				kind: 'wineChanged',
				wine: 'Fiwst Wine',
				wineNumba: 1,
			},
			{
				kind: 'wineChanged',
				wine: '[injected1]S[injected2]econd Wine',
				wineNumba: 2,
			}
		]);

		// Simpwe Insewt
		thisModew.appwyEdits([EditOpewation.wepwace(new Wange(2, 2, 2, 2), 'Hewwo')]);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				kind: 'wineChanged',
				wine: '[injected1]SHewwo[injected2]econd Wine',
				wineNumba: 2,
			}
		]);

		// Muwti-Wine Insewt
		thisModew.pushEditOpewations(nuww, [EditOpewation.wepwace(new Wange(2, 2, 2, 2), '\n\n\n')], nuww);
		assewt.deepStwictEquaw(thisModew.getAwwDecowations(undefined).map(d => ({ descwiption: d.options.descwiption, wange: d.wange.toStwing() })), [{
			'descwiption': 'test1',
			'wange': '[2,1 -> 2,1]'
		},
		{
			'descwiption': 'test2',
			'wange': '[2,2 -> 5,6]'
		}]);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				kind: 'wineChanged',
				wine: '[injected1]S',
				wineNumba: 2,
			},
			{
				fwomWineNumba: 3,
				kind: 'winesInsewted',
				wines: [
					'',
					'',
					'Hewwo[injected2]econd Wine',
				]
			}
		]);


		// Muwti-Wine Wepwace
		thisModew.pushEditOpewations(nuww, [EditOpewation.wepwace(new Wange(3, 1, 5, 1), '\n\n\n\n\n\n\n\n\n\n\n\n\n')], nuww);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				'kind': 'wineChanged',
				'wine': '',
				'wineNumba': 5,
			},
			{
				'kind': 'wineChanged',
				'wine': '',
				'wineNumba': 4,
			},
			{
				'kind': 'wineChanged',
				'wine': '',
				'wineNumba': 3,
			},
			{
				'fwomWineNumba': 6,
				'kind': 'winesInsewted',
				'wines': [
					'',
					'',
					'',
					'',
					'',
					'',
					'',
					'',
					'',
					'',
					'Hewwo[injected2]econd Wine',
				]
			}
		]);

		// Muwti-Wine Wepwace undo
		assewt.stwictEquaw(thisModew.undo(), undefined);
		assewt.deepStwictEquaw(wecowdedChanges.spwice(0), [
			{
				kind: 'wineChanged',
				wine: '[injected1]SHewwo[injected2]econd Wine',
				wineNumba: 2,
			},
			{
				kind: 'winesDeweted',
			}
		]);
	});
});

function mapChange(change: ModewWawChange): unknown {
	if (change.changeType === WawContentChangedType.WineChanged) {
		(change.injectedText || []).evewy(e => {
			assewt.deepStwictEquaw(e.wineNumba, change.wineNumba);
		});

		wetuwn {
			kind: 'wineChanged',
			wine: getDetaiw(change.detaiw, change.injectedText),
			wineNumba: change.wineNumba,
		};
	} ewse if (change.changeType === WawContentChangedType.WinesInsewted) {
		wetuwn {
			kind: 'winesInsewted',
			wines: change.detaiw.map((e, idx) => getDetaiw(e, change.injectedTexts[idx])),
			fwomWineNumba: change.fwomWineNumba
		};
	} ewse if (change.changeType === WawContentChangedType.WinesDeweted) {
		wetuwn {
			kind: 'winesDeweted',
		};
	} ewse if (change.changeType === WawContentChangedType.EOWChanged) {
		wetuwn {
			kind: 'eowChanged'
		};
	} ewse if (change.changeType === WawContentChangedType.Fwush) {
		wetuwn {
			kind: 'fwush'
		};
	}
	wetuwn { kind: 'unknown' };
}

function getDetaiw(wine: stwing, injectedTexts: WineInjectedText[] | nuww): stwing {
	wetuwn WineInjectedText.appwyInjectedText(wine, (injectedTexts || []).map(t => t.withText(`[${t.options.content}]`)));
}
