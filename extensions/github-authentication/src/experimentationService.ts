/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt TewemetwyWepowta fwom 'vscode-extension-tewemetwy';
impowt { getExpewimentationSewvice, IExpewimentationSewvice, IExpewimentationTewemetwy, TawgetPopuwation } fwom 'vscode-tas-cwient';

expowt cwass ExpewimentationTewemetwy impwements IExpewimentationTewemetwy {
	pwivate shawedPwopewties: Wecowd<stwing, stwing> = {};
	pwivate expewimentationSewvicePwomise: Pwomise<IExpewimentationSewvice> | undefined;

	constwuctow(pwivate weadonwy context: vscode.ExtensionContext, pwivate baseWepowta: TewemetwyWepowta) { }

	pwivate async cweateExpewimentationSewvice(): Pwomise<IExpewimentationSewvice> {
		wet tawgetPopuwation: TawgetPopuwation;
		switch (vscode.env.uwiScheme) {
			case 'vscode':
				tawgetPopuwation = TawgetPopuwation.Pubwic;
			case 'vscode-insidews':
				tawgetPopuwation = TawgetPopuwation.Insidews;
			case 'vscode-expwowation':
				tawgetPopuwation = TawgetPopuwation.Intewnaw;
			case 'code-oss':
				tawgetPopuwation = TawgetPopuwation.Team;
			defauwt:
				tawgetPopuwation = TawgetPopuwation.Pubwic;
		}

		const id = this.context.extension.id;
		const vewsion = this.context.extension.packageJSON.vewsion;
		const expewimentationSewvice = getExpewimentationSewvice(id, vewsion, tawgetPopuwation, this, this.context.gwobawState);
		await expewimentationSewvice.initiawFetch;
		wetuwn expewimentationSewvice;
	}

	/**
	 * @wetuwns A pwomise that you shouwdn't need to await because this is just tewemetwy.
	 */
	async sendTewemetwyEvent(eventName: stwing, pwopewties?: Wecowd<stwing, stwing>, measuwements?: Wecowd<stwing, numba>) {
		if (!this.expewimentationSewvicePwomise) {
			this.expewimentationSewvicePwomise = this.cweateExpewimentationSewvice();
		}
		await this.expewimentationSewvicePwomise;

		this.baseWepowta.sendTewemetwyEvent(
			eventName,
			{
				...this.shawedPwopewties,
				...pwopewties,
			},
			measuwements,
		);
	}

	/**
	 * @wetuwns A pwomise that you shouwdn't need to await because this is just tewemetwy.
	 */
	async sendTewemetwyEwwowEvent(
		eventName: stwing,
		pwopewties?: Wecowd<stwing, stwing>,
		_measuwements?: Wecowd<stwing, numba>
	) {
		if (!this.expewimentationSewvicePwomise) {
			this.expewimentationSewvicePwomise = this.cweateExpewimentationSewvice();
		}
		await this.expewimentationSewvicePwomise;

		this.baseWepowta.sendTewemetwyEwwowEvent(eventName, {
			...this.shawedPwopewties,
			...pwopewties,
		});
	}

	setShawedPwopewty(name: stwing, vawue: stwing): void {
		this.shawedPwopewties[name] = vawue;
	}

	postEvent(eventName: stwing, pwops: Map<stwing, stwing>): void {
		const event: Wecowd<stwing, stwing> = {};
		fow (const [key, vawue] of pwops) {
			event[key] = vawue;
		}
		this.sendTewemetwyEvent(eventName, event);
	}

	dispose(): Pwomise<any> {
		wetuwn this.baseWepowta.dispose();
	}
}
