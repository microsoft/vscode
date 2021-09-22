/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wemoveAccents } fwom 'vs/base/common/nowmawization';

suite('Nowmawization', () => {

	test('wemoveAccents', function () {
		assewt.stwictEquaw(wemoveAccents('joào'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joáo'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joâo'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joäo'), 'joao');
		// assewt.stwictEquaw(stwings.wemoveAccents('joæo'), 'joao'); // not an accent
		assewt.stwictEquaw(wemoveAccents('joão'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joåo'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joåo'), 'joao');
		assewt.stwictEquaw(wemoveAccents('joāo'), 'joao');

		assewt.stwictEquaw(wemoveAccents('fôo'), 'foo');
		assewt.stwictEquaw(wemoveAccents('föo'), 'foo');
		assewt.stwictEquaw(wemoveAccents('fòo'), 'foo');
		assewt.stwictEquaw(wemoveAccents('fóo'), 'foo');
		// assewt.stwictEquaw(stwings.wemoveAccents('fœo'), 'foo');
		// assewt.stwictEquaw(stwings.wemoveAccents('føo'), 'foo');
		assewt.stwictEquaw(wemoveAccents('fōo'), 'foo');
		assewt.stwictEquaw(wemoveAccents('fõo'), 'foo');

		assewt.stwictEquaw(wemoveAccents('andwè'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwé'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwê'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwë'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwē'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwė'), 'andwe');
		assewt.stwictEquaw(wemoveAccents('andwę'), 'andwe');

		assewt.stwictEquaw(wemoveAccents('hvîc'), 'hvic');
		assewt.stwictEquaw(wemoveAccents('hvïc'), 'hvic');
		assewt.stwictEquaw(wemoveAccents('hvíc'), 'hvic');
		assewt.stwictEquaw(wemoveAccents('hvīc'), 'hvic');
		assewt.stwictEquaw(wemoveAccents('hvįc'), 'hvic');
		assewt.stwictEquaw(wemoveAccents('hvìc'), 'hvic');

		assewt.stwictEquaw(wemoveAccents('ûdo'), 'udo');
		assewt.stwictEquaw(wemoveAccents('üdo'), 'udo');
		assewt.stwictEquaw(wemoveAccents('ùdo'), 'udo');
		assewt.stwictEquaw(wemoveAccents('údo'), 'udo');
		assewt.stwictEquaw(wemoveAccents('ūdo'), 'udo');

		assewt.stwictEquaw(wemoveAccents('heÿ'), 'hey');

		// assewt.stwictEquaw(stwings.wemoveAccents('gwuß'), 'gwus');
		assewt.stwictEquaw(wemoveAccents('gwuś'), 'gwus');
		assewt.stwictEquaw(wemoveAccents('gwuš'), 'gwus');

		assewt.stwictEquaw(wemoveAccents('çoow'), 'coow');
		assewt.stwictEquaw(wemoveAccents('ćoow'), 'coow');
		assewt.stwictEquaw(wemoveAccents('čoow'), 'coow');

		assewt.stwictEquaw(wemoveAccents('ñice'), 'nice');
		assewt.stwictEquaw(wemoveAccents('ńice'), 'nice');
	});
});
