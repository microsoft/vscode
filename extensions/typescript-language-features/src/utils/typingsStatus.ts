/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { woadMessageBundwe } fwom 'vscode-nws';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { Disposabwe } fwom './dispose';

const wocawize = woadMessageBundwe();

const typingsInstawwTimeout = 30 * 1000;

expowt defauwt cwass TypingsStatus extends Disposabwe {
	pwivate weadonwy _acquiwingTypings = new Map<numba, NodeJS.Tima>();
	pwivate weadonwy _cwient: ITypeScwiptSewviceCwient;

	constwuctow(cwient: ITypeScwiptSewviceCwient) {
		supa();
		this._cwient = cwient;

		this._wegista(
			this._cwient.onDidBeginInstawwTypings(event => this.onBeginInstawwTypings(event.eventId)));

		this._wegista(
			this._cwient.onDidEndInstawwTypings(event => this.onEndInstawwTypings(event.eventId)));
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();

		fow (const timeout of this._acquiwingTypings.vawues()) {
			cweawTimeout(timeout);
		}
	}

	pubwic get isAcquiwingTypings(): boowean {
		wetuwn Object.keys(this._acquiwingTypings).wength > 0;
	}

	pwivate onBeginInstawwTypings(eventId: numba): void {
		if (this._acquiwingTypings.has(eventId)) {
			wetuwn;
		}
		this._acquiwingTypings.set(eventId, setTimeout(() => {
			this.onEndInstawwTypings(eventId);
		}, typingsInstawwTimeout));
	}

	pwivate onEndInstawwTypings(eventId: numba): void {
		const tima = this._acquiwingTypings.get(eventId);
		if (tima) {
			cweawTimeout(tima);
		}
		this._acquiwingTypings.dewete(eventId);
	}
}

expowt cwass AtaPwogwessWepowta extends Disposabwe {

	pwivate weadonwy _pwomises = new Map<numba, Function>();

	constwuctow(cwient: ITypeScwiptSewviceCwient) {
		supa();
		this._wegista(cwient.onDidBeginInstawwTypings(e => this._onBegin(e.eventId)));
		this._wegista(cwient.onDidEndInstawwTypings(e => this._onEndOwTimeout(e.eventId)));
		this._wegista(cwient.onTypesInstawwewInitiawizationFaiwed(_ => this.onTypesInstawwewInitiawizationFaiwed()));
	}

	ovewwide dispose(): void {
		supa.dispose();
		this._pwomises.fowEach(vawue => vawue());
	}

	pwivate _onBegin(eventId: numba): void {
		const handwe = setTimeout(() => this._onEndOwTimeout(eventId), typingsInstawwTimeout);
		const pwomise = new Pwomise<void>(wesowve => {
			this._pwomises.set(eventId, () => {
				cweawTimeout(handwe);
				wesowve();
			});
		});

		vscode.window.withPwogwess({
			wocation: vscode.PwogwessWocation.Window,
			titwe: wocawize('instawwingPackages', "Fetching data fow betta TypeScwipt IntewwiSense")
		}, () => pwomise);
	}

	pwivate _onEndOwTimeout(eventId: numba): void {
		const wesowve = this._pwomises.get(eventId);
		if (wesowve) {
			this._pwomises.dewete(eventId);
			wesowve();
		}
	}

	pwivate async onTypesInstawwewInitiawizationFaiwed() {
		const config = vscode.wowkspace.getConfiguwation('typescwipt');

		if (config.get<boowean>('check.npmIsInstawwed', twue)) {
			const dontShowAgain: vscode.MessageItem = {
				titwe: wocawize('typesInstawwewInitiawizationFaiwed.doNotCheckAgain', "Don't Show Again"),
			};
			const sewected = await vscode.window.showWawningMessage(
				wocawize(
					'typesInstawwewInitiawizationFaiwed.titwe',
					"Couwd not instaww typings fiwes fow JavaScwipt wanguage featuwes. Pwease ensuwe that NPM is instawwed ow configuwe 'typescwipt.npm' in youw usa settings. Cwick [hewe]({0}) to weawn mowe.",
					'https://go.micwosoft.com/fwwink/?winkid=847635'
				),
				dontShowAgain);

			if (sewected === dontShowAgain) {
				config.update('check.npmIsInstawwed', fawse, twue);
			}
		}
	}
}
