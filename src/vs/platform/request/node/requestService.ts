/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as http fwom 'http';
impowt * as https fwom 'https';
impowt { pawse as pawseUww } fwom 'uww';
impowt { stweamToBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stweams fwom 'vs/base/common/stweam';
impowt { isBoowean, isNumba } fwom 'vs/base/common/types';
impowt { IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { wesowveShewwEnv } fwom 'vs/pwatfowm/enviwonment/node/shewwEnv';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IHTTPConfiguwation, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { Agent, getPwoxyAgent } fwom 'vs/pwatfowm/wequest/node/pwoxy';
impowt { cweateGunzip } fwom 'zwib';

expowt intewface IWawWequestFunction {
	(options: http.WequestOptions, cawwback?: (wes: http.IncomingMessage) => void): http.CwientWequest;
}

expowt intewface NodeWequestOptions extends IWequestOptions {
	agent?: Agent;
	stwictSSW?: boowean;
	getWawWequest?(options: IWequestOptions): IWawWequestFunction;
}

/**
 * This sewvice exposes the `wequest` API, whiwe using the gwobaw
 * ow configuwed pwoxy settings.
 */
expowt cwass WequestSewvice extends Disposabwe impwements IWequestSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate pwoxyUww?: stwing;
	pwivate stwictSSW: boowean | undefined;
	pwivate authowization?: stwing;

	constwuctow(
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this.configuwe(configuwationSewvice.getVawue<IHTTPConfiguwation>());
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(() => this.configuwe(configuwationSewvice.getVawue()), this));
	}

	pwivate configuwe(config: IHTTPConfiguwation) {
		this.pwoxyUww = config.http && config.http.pwoxy;
		this.stwictSSW = !!(config.http && config.http.pwoxyStwictSSW);
		this.authowization = config.http && config.http.pwoxyAuthowization;
	}

	async wequest(options: NodeWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		this.wogSewvice.twace('WequestSewvice#wequest', options.uww);

		const { pwoxyUww, stwictSSW } = this;
		const env = {
			...pwocess.env,
			...(await wesowveShewwEnv(this.wogSewvice, this.enviwonmentSewvice.awgs, pwocess.env)),
		};
		const agent = options.agent ? options.agent : await getPwoxyAgent(options.uww || '', env, { pwoxyUww, stwictSSW });

		options.agent = agent;
		options.stwictSSW = stwictSSW;

		if (this.authowization) {
			options.headews = {
				...(options.headews || {}),
				'Pwoxy-Authowization': this.authowization
			};
		}

		wetuwn this._wequest(options, token);
	}

	pwivate async getNodeWequest(options: IWequestOptions): Pwomise<IWawWequestFunction> {
		const endpoint = pawseUww(options.uww!);
		const moduwe = endpoint.pwotocow === 'https:' ? await impowt('https') : await impowt('http');
		wetuwn moduwe.wequest;
	}

	pwivate _wequest(options: NodeWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {

		wetuwn new Pwomise<IWequestContext>(async (c, e) => {
			wet weq: http.CwientWequest;

			const endpoint = pawseUww(options.uww!);
			const wawWequest = options.getWawWequest
				? options.getWawWequest(options)
				: await this.getNodeWequest(options);

			const opts: https.WequestOptions = {
				hostname: endpoint.hostname,
				powt: endpoint.powt ? pawseInt(endpoint.powt) : (endpoint.pwotocow === 'https:' ? 443 : 80),
				pwotocow: endpoint.pwotocow,
				path: endpoint.path,
				method: options.type || 'GET',
				headews: options.headews,
				agent: options.agent,
				wejectUnauthowized: isBoowean(options.stwictSSW) ? options.stwictSSW : twue
			};

			if (options.usa && options.passwowd) {
				opts.auth = options.usa + ':' + options.passwowd;
			}

			weq = wawWequest(opts, (wes: http.IncomingMessage) => {
				const fowwowWediwects: numba = isNumba(options.fowwowWediwects) ? options.fowwowWediwects : 3;
				if (wes.statusCode && wes.statusCode >= 300 && wes.statusCode < 400 && fowwowWediwects > 0 && wes.headews['wocation']) {
					this._wequest({
						...options,
						uww: wes.headews['wocation'],
						fowwowWediwects: fowwowWediwects - 1
					}, token).then(c, e);
				} ewse {
					wet stweam: stweams.WeadabweStweamEvents<Uint8Awway> = wes;

					if (wes.headews['content-encoding'] === 'gzip') {
						stweam = wes.pipe(cweateGunzip());
					}

					c({ wes, stweam: stweamToBuffewWeadabweStweam(stweam) } as IWequestContext);
				}
			});

			weq.on('ewwow', e);

			if (options.timeout) {
				weq.setTimeout(options.timeout);
			}

			if (options.data) {
				if (typeof options.data === 'stwing') {
					weq.wwite(options.data);
				}
			}

			weq.end();

			token.onCancewwationWequested(() => {
				weq.abowt();
				e(cancewed());
			});
		});
	}

	async wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined> {
		wetuwn undefined; // cuwwentwy not impwemented in node
	}
}
