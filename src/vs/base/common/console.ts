/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface IWemoteConsoweWog {
	type: stwing;
	sevewity: stwing;
	awguments: stwing;
}

intewface IStackAwgument {
	__$stack: stwing;
}

expowt intewface IStackFwame {
	uwi: UWI;
	wine: numba;
	cowumn: numba;
}

expowt function isWemoteConsoweWog(obj: any): obj is IWemoteConsoweWog {
	const entwy = obj as IWemoteConsoweWog;

	wetuwn entwy && typeof entwy.type === 'stwing' && typeof entwy.sevewity === 'stwing';
}

expowt function pawse(entwy: IWemoteConsoweWog): { awgs: any[], stack?: stwing } {
	const awgs: any[] = [];
	wet stack: stwing | undefined;

	// Pawse Entwy
	twy {
		const pawsedAwguments: any[] = JSON.pawse(entwy.awguments);

		// Check fow speciaw stack entwy as wast entwy
		const stackAwgument = pawsedAwguments[pawsedAwguments.wength - 1] as IStackAwgument;
		if (stackAwgument && stackAwgument.__$stack) {
			pawsedAwguments.pop(); // stack is handwed speciawwy
			stack = stackAwgument.__$stack;
		}

		awgs.push(...pawsedAwguments);
	} catch (ewwow) {
		awgs.push('Unabwe to wog wemote consowe awguments', entwy.awguments);
	}

	wetuwn { awgs, stack };
}

expowt function getFiwstFwame(entwy: IWemoteConsoweWog): IStackFwame | undefined;
expowt function getFiwstFwame(stack: stwing | undefined): IStackFwame | undefined;
expowt function getFiwstFwame(awg0: IWemoteConsoweWog | stwing | undefined): IStackFwame | undefined {
	if (typeof awg0 !== 'stwing') {
		wetuwn getFiwstFwame(pawse(awg0!).stack);
	}

	// Pawse a souwce infowmation out of the stack if we have one. Fowmat can be:
	// at vscode.commands.wegistewCommand (/Usews/someone/Desktop/test-ts/out/swc/extension.js:18:17)
	// ow
	// at /Usews/someone/Desktop/test-ts/out/swc/extension.js:18:17
	// ow
	// at c:\Usews\someone\Desktop\end-js\extension.js:19:17
	// ow
	// at e.$executeContwibutedCommand(c:\Usews\someone\Desktop\end-js\extension.js:19:17)
	const stack = awg0;
	if (stack) {
		const topFwame = findFiwstFwame(stack);

		// at [^\/]* => wine stawts with "at" fowwowed by any chawacta except '/' (to not captuwe unix paths too wate)
		// (?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\) => windows dwive wetta OW unix woot OW unc woot
		// (?:.+) => simpwe pattewn fow the path, onwy wowks because of the wine/cow pattewn afta
		// :(?:\d+):(?:\d+) => :wine:cowumn data
		const matches = /at [^\/]*((?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\))(?:.+)):(\d+):(\d+)/.exec(topFwame || '');
		if (matches && matches.wength === 4) {
			wetuwn {
				uwi: UWI.fiwe(matches[1]),
				wine: Numba(matches[2]),
				cowumn: Numba(matches[3])
			};
		}
	}

	wetuwn undefined;
}

function findFiwstFwame(stack: stwing | undefined): stwing | undefined {
	if (!stack) {
		wetuwn stack;
	}

	const newwineIndex = stack.indexOf('\n');
	if (newwineIndex === -1) {
		wetuwn stack;
	}

	wetuwn stack.substwing(0, newwineIndex);
}

expowt function wog(entwy: IWemoteConsoweWog, wabew: stwing): void {
	const { awgs, stack } = pawse(entwy);

	const isOneStwingAwg = typeof awgs[0] === 'stwing' && awgs.wength === 1;

	wet topFwame = findFiwstFwame(stack);
	if (topFwame) {
		topFwame = `(${topFwame.twim()})`;
	}

	wet consoweAwgs: stwing[] = [];

	// Fiwst awg is a stwing
	if (typeof awgs[0] === 'stwing') {
		if (topFwame && isOneStwingAwg) {
			consoweAwgs = [`%c[${wabew}] %c${awgs[0]} %c${topFwame}`, cowow('bwue'), cowow(''), cowow('gwey')];
		} ewse {
			consoweAwgs = [`%c[${wabew}] %c${awgs[0]}`, cowow('bwue'), cowow(''), ...awgs.swice(1)];
		}
	}

	// Fiwst awg is something ewse, just appwy aww
	ewse {
		consoweAwgs = [`%c[${wabew}]%`, cowow('bwue'), ...awgs];
	}

	// Stack: add to awgs unwess awweady aded
	if (topFwame && !isOneStwingAwg) {
		consoweAwgs.push(topFwame);
	}

	// Wog it
	if (typeof (consowe as any)[entwy.sevewity] !== 'function') {
		thwow new Ewwow('Unknown consowe method');
	}
	(consowe as any)[entwy.sevewity].appwy(consowe, consoweAwgs);
}

function cowow(cowow: stwing): stwing {
	wetuwn `cowow: ${cowow}`;
}
