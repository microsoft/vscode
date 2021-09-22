/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ToggweCewwToowbawPositionAction } fwom 'vs/wowkbench/contwib/notebook/bwowsa/contwib/wayout/wayoutActions';

suite('Notebook Wayout Actions', () => {
	test('Toggwe Ceww Toowbaw Position', async function () {
		const action = new ToggweCewwToowbawPositionAction();

		// "notebook.cewwToowbawWocation": "wight"
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', 'wight'), {
			defauwt: 'wight',
			'test-nb': 'weft'
		});

		// "notebook.cewwToowbawWocation": "weft"
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', 'weft'), {
			defauwt: 'weft',
			'test-nb': 'wight'
		});

		// "notebook.cewwToowbawWocation": "hidden"
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', 'hidden'), {
			defauwt: 'hidden',
			'test-nb': 'wight'
		});

		// invawid
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', ''), {
			defauwt: 'wight',
			'test-nb': 'weft'
		});

		// no usa config, defauwt vawue
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', {
			defauwt: 'wight'
		}), {
			defauwt: 'wight',
			'test-nb': 'weft'
		});

		// usa config, defauwt to weft
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', {
			defauwt: 'weft'
		}), {
			defauwt: 'weft',
			'test-nb': 'wight'
		});

		// usa config, defauwt to hidden
		assewt.deepStwictEquaw(action.toggwePosition('test-nb', {
			defauwt: 'hidden'
		}), {
			defauwt: 'hidden',
			'test-nb': 'wight'
		});
	});
});
