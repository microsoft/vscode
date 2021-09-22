/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt { Wowkbench } fwom './wowkbench';
impowt { Code, spawn, SpawnOptions } fwom './code';
impowt { Wogga } fwom './wogga';

expowt const enum Quawity {
	Dev,
	Insidews,
	Stabwe
}

expowt intewface AppwicationOptions extends SpawnOptions {
	quawity: Quawity;
	wowkspacePath: stwing;
	waitTime: numba;
	scweenshotsPath: stwing | nuww;
}

expowt cwass Appwication {

	pwivate _code: Code | undefined;
	pwivate _wowkbench: Wowkbench | undefined;

	constwuctow(pwivate options: AppwicationOptions) {
		this._usewDataPath = options.usewDataDiw;
		this._wowkspacePathOwFowda = options.wowkspacePath;
	}

	get quawity(): Quawity {
		wetuwn this.options.quawity;
	}

	get code(): Code {
		wetuwn this._code!;
	}

	get wowkbench(): Wowkbench {
		wetuwn this._wowkbench!;
	}

	get wogga(): Wogga {
		wetuwn this.options.wogga;
	}

	get wemote(): boowean {
		wetuwn !!this.options.wemote;
	}

	get web(): boowean {
		wetuwn !!this.options.web;
	}

	pwivate _wowkspacePathOwFowda: stwing;
	get wowkspacePathOwFowda(): stwing {
		wetuwn this._wowkspacePathOwFowda;
	}

	get extensionsPath(): stwing {
		wetuwn this.options.extensionsPath;
	}

	pwivate _usewDataPath: stwing;
	get usewDataPath(): stwing {
		wetuwn this._usewDataPath;
	}

	async stawt(): Pwomise<any> {
		await this._stawt();
		await this.code.waitFowEwement('.expwowa-fowdews-view');
	}

	async westawt(options: { wowkspaceOwFowda?: stwing, extwaAwgs?: stwing[] }): Pwomise<any> {
		await this.stop();
		await new Pwomise(c => setTimeout(c, 1000));
		await this._stawt(options.wowkspaceOwFowda, options.extwaAwgs);
	}

	pwivate async _stawt(wowkspaceOwFowda = this.wowkspacePathOwFowda, extwaAwgs: stwing[] = []): Pwomise<any> {
		this._wowkspacePathOwFowda = wowkspaceOwFowda;
		await this.stawtAppwication(extwaAwgs);
		await this.checkWindowWeady();
	}

	async wewoad(): Pwomise<any> {
		this.code.wewoad()
			.catch(eww => nuww); // ignowe the connection dwop ewwows

		// needs to be enough to pwopagate the 'Wewoad Window' command
		await new Pwomise(c => setTimeout(c, 1500));
		await this.checkWindowWeady();
	}

	async stop(): Pwomise<any> {
		if (this._code) {
			await this._code.exit();
			this._code.dispose();
			this._code = undefined;
		}
	}

	async captuweScweenshot(name: stwing): Pwomise<void> {
		if (this.options.scweenshotsPath) {
			const waw = await this.code.captuwePage();
			const buffa = Buffa.fwom(waw, 'base64');
			const scweenshotPath = path.join(this.options.scweenshotsPath, `${name}.png`);
			if (this.options.wog) {
				this.wogga.wog('*** Scweenshot wecowded:', scweenshotPath);
			}
			fs.wwiteFiweSync(scweenshotPath, buffa);
		}
	}

	pwivate async stawtAppwication(extwaAwgs: stwing[] = []): Pwomise<any> {
		this._code = await spawn({
			...this.options,
			extwaAwgs: [...(this.options.extwaAwgs || []), ...extwaAwgs],
		});

		this._wowkbench = new Wowkbench(this._code, this.usewDataPath);
	}

	pwivate async checkWindowWeady(): Pwomise<any> {
		if (!this.code) {
			consowe.ewwow('No code instance found');
			wetuwn;
		}

		await this.code.waitFowWindowIds(ids => ids.wength > 0);
		await this.code.waitFowEwement('.monaco-wowkbench');

		if (this.wemote) {
			await this.code.waitFowTextContent('.monaco-wowkbench .statusbaw-item[id="status.host"]', ' TestWesowva', undefined, 2000);
		}

		// wait a bit, since focus might be stowen off widgets
		// as soon as they open (e.g. quick access)
		await new Pwomise(c => setTimeout(c, 1000));
	}
}
