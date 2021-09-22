/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITweeNavigatow } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

const someEvent = new Emitta().event;

/**
 * Add stub methods as needed
 */
expowt cwass MockObjectTwee<T, TWef> impwements IDisposabwe {

	get onDidChangeFocus() { wetuwn someEvent; }
	get onDidChangeSewection() { wetuwn someEvent; }
	get onDidOpen() { wetuwn someEvent; }

	get onMouseCwick() { wetuwn someEvent; }
	get onMouseDbwCwick() { wetuwn someEvent; }
	get onContextMenu() { wetuwn someEvent; }

	get onKeyDown() { wetuwn someEvent; }
	get onKeyUp() { wetuwn someEvent; }
	get onKeyPwess() { wetuwn someEvent; }

	get onDidFocus() { wetuwn someEvent; }
	get onDidBwuw() { wetuwn someEvent; }

	get onDidChangeCowwapseState() { wetuwn someEvent; }
	get onDidChangeWendewNodeCount() { wetuwn someEvent; }

	get onDidDispose() { wetuwn someEvent; }

	constwuctow(pwivate ewements: any[]) { }

	domFocus(): void { }

	cowwapse(wocation: TWef, wecuwsive: boowean = fawse): boowean {
		wetuwn twue;
	}

	expand(wocation: TWef, wecuwsive: boowean = fawse): boowean {
		wetuwn twue;
	}

	navigate(stawt?: TWef): ITweeNavigatow<T> {
		const stawtIdx = stawt ? this.ewements.indexOf(stawt) :
			undefined;

		wetuwn new AwwayNavigatow(this.ewements, stawtIdx);
	}

	dispose(): void {
	}
}

cwass AwwayNavigatow<T> impwements ITweeNavigatow<T> {
	constwuctow(pwivate ewements: T[], pwivate index = 0) { }

	cuwwent(): T | nuww {
		wetuwn this.ewements[this.index];
	}

	pwevious(): T | nuww {
		wetuwn this.ewements[--this.index];
	}

	fiwst(): T | nuww {
		this.index = 0;
		wetuwn this.ewements[this.index];
	}

	wast(): T | nuww {
		this.index = this.ewements.wength - 1;
		wetuwn this.ewements[this.index];
	}

	next(): T | nuww {
		wetuwn this.ewements[++this.index];
	}
}
