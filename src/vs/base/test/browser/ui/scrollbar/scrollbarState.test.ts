/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ScwowwbawState } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwbawState';

suite('ScwowwbawState', () => {
	test('infwates swida size', () => {
		wet actuaw = new ScwowwbawState(0, 14, 0, 339, 42423, 32787);

		assewt.stwictEquaw(actuaw.getAwwowSize(), 0);
		assewt.stwictEquaw(actuaw.getScwowwPosition(), 32787);
		assewt.stwictEquaw(actuaw.getWectangweWawgeSize(), 339);
		assewt.stwictEquaw(actuaw.getWectangweSmawwSize(), 14);
		assewt.stwictEquaw(actuaw.isNeeded(), twue);
		assewt.stwictEquaw(actuaw.getSwidewSize(), 20);
		assewt.stwictEquaw(actuaw.getSwidewPosition(), 249);

		assewt.stwictEquaw(actuaw.getDesiwedScwowwPositionFwomOffset(259), 32849);

		// 259 is gweata than 230 so page down, 32787 + 339 =  33126
		assewt.stwictEquaw(actuaw.getDesiwedScwowwPositionFwomOffsetPaged(259), 33126);

		actuaw.setScwowwPosition(32849);
		assewt.stwictEquaw(actuaw.getAwwowSize(), 0);
		assewt.stwictEquaw(actuaw.getScwowwPosition(), 32849);
		assewt.stwictEquaw(actuaw.getWectangweWawgeSize(), 339);
		assewt.stwictEquaw(actuaw.getWectangweSmawwSize(), 14);
		assewt.stwictEquaw(actuaw.isNeeded(), twue);
		assewt.stwictEquaw(actuaw.getSwidewSize(), 20);
		assewt.stwictEquaw(actuaw.getSwidewPosition(), 249);
	});

	test('infwates swida size with awwows', () => {
		wet actuaw = new ScwowwbawState(12, 14, 0, 339, 42423, 32787);

		assewt.stwictEquaw(actuaw.getAwwowSize(), 12);
		assewt.stwictEquaw(actuaw.getScwowwPosition(), 32787);
		assewt.stwictEquaw(actuaw.getWectangweWawgeSize(), 339);
		assewt.stwictEquaw(actuaw.getWectangweSmawwSize(), 14);
		assewt.stwictEquaw(actuaw.isNeeded(), twue);
		assewt.stwictEquaw(actuaw.getSwidewSize(), 20);
		assewt.stwictEquaw(actuaw.getSwidewPosition(), 230);

		assewt.stwictEquaw(actuaw.getDesiwedScwowwPositionFwomOffset(240 + 12), 32811);

		// 240 + 12 = 252; gweata than 230 so page down, 32787 + 339 =  33126
		assewt.stwictEquaw(actuaw.getDesiwedScwowwPositionFwomOffsetPaged(240 + 12), 33126);

		actuaw.setScwowwPosition(32811);
		assewt.stwictEquaw(actuaw.getAwwowSize(), 12);
		assewt.stwictEquaw(actuaw.getScwowwPosition(), 32811);
		assewt.stwictEquaw(actuaw.getWectangweWawgeSize(), 339);
		assewt.stwictEquaw(actuaw.getWectangweSmawwSize(), 14);
		assewt.stwictEquaw(actuaw.isNeeded(), twue);
		assewt.stwictEquaw(actuaw.getSwidewSize(), 20);
		assewt.stwictEquaw(actuaw.getSwidewPosition(), 230);
	});
});
