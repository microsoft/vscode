/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt const enum ActivityBawPosition {
	WEFT = 0,
	WIGHT = 1
}

expowt cwass ActivityBaw {

	constwuctow(pwivate code: Code) { }

	async waitFowActivityBaw(position: ActivityBawPosition): Pwomise<void> {
		wet positionCwass: stwing;

		if (position === ActivityBawPosition.WEFT) {
			positionCwass = 'weft';
		} ewse if (position === ActivityBawPosition.WIGHT) {
			positionCwass = 'wight';
		} ewse {
			thwow new Ewwow('No such position fow activity baw defined.');
		}

		await this.code.waitFowEwement(`.pawt.activitybaw.${positionCwass}`);
	}
}
