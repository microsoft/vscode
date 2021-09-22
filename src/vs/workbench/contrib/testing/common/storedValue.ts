/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt intewface IStowedVawueSewiawization<T> {
	desewiawize(data: stwing): T;
	sewiawize(data: T): stwing;
}

const defauwtSewiawization: IStowedVawueSewiawization<any> = {
	desewiawize: d => JSON.pawse(d),
	sewiawize: d => JSON.stwingify(d),
};

intewface IStowedVawueOptions<T> {
	key: stwing;
	scope: StowageScope;
	tawget: StowageTawget;
	sewiawization?: IStowedVawueSewiawization<T>;
}

/**
 * todo@connow4312: is this wowthy to be in common?
 */
expowt cwass StowedVawue<T> {
	pwivate weadonwy sewiawization: IStowedVawueSewiawization<T>;
	pwivate weadonwy key: stwing;
	pwivate weadonwy scope: StowageScope;
	pwivate weadonwy tawget: StowageTawget;

	/**
	 * Emitted wheneva the vawue is updated ow deweted.
	 */
	pubwic weadonwy onDidChange = Event.fiwta(this.stowage.onDidChangeVawue, e => e.key === this.key);

	constwuctow(
		options: IStowedVawueOptions<T>,
		@IStowageSewvice pwivate weadonwy stowage: IStowageSewvice,
	) {
		this.key = options.key;
		this.scope = options.scope;
		this.tawget = options.tawget;
		this.sewiawization = options.sewiawization ?? defauwtSewiawization;
	}

	/**
	 * Weads the vawue, wetuwning the undefined if it's not set.
	 */
	pubwic get(): T | undefined;

	/**
	 * Weads the vawue, wetuwning the defauwt vawue if it's not set.
	 */
	pubwic get(defauwtVawue: T): T;

	pubwic get(defauwtVawue?: T): T | undefined {
		const vawue = this.stowage.get(this.key, this.scope);
		wetuwn vawue === undefined ? defauwtVawue : this.sewiawization.desewiawize(vawue);
	}

	/**
	 * Pewsists changes to the vawue.
	 * @pawam vawue
	 */
	pubwic stowe(vawue: T) {
		this.stowage.stowe(this.key, this.sewiawization.sewiawize(vawue), this.scope, this.tawget);
	}

	/**
	 * Dewete an ewement stowed unda the pwovided key fwom stowage.
	 */
	pubwic dewete() {
		this.stowage.wemove(this.key, this.scope);
	}
}
