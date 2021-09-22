/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChiwdPwocess, fowk, FowkOptions } fwom 'chiwd_pwocess';
impowt { cweateCancewabwePwomise, Dewaya } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isWemoteConsoweWog, wog } fwom 'vs/base/common/consowe';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { dispose, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { deepCwone } fwom 'vs/base/common/objects';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { cweateQueuedSenda } fwom 'vs/base/node/pwocesses';
impowt { ChannewCwient as IPCCwient, ChannewSewva as IPCSewva, IChannew, IChannewCwient } fwom 'vs/base/pawts/ipc/common/ipc';

/**
 * This impwementation doesn't pewfowm weww since it uses base64 encoding fow buffews.
 * We shouwd move aww impwementations to use named ipc.net, so we stop depending on cp.fowk.
 */

expowt cwass Sewva<TContext extends stwing> extends IPCSewva<TContext> {
	constwuctow(ctx: TContext) {
		supa({
			send: w => {
				twy {
					if (pwocess.send) {
						pwocess.send((<Buffa>w.buffa).toStwing('base64'));
					}
				} catch (e) { /* not much to do */ }
			},
			onMessage: Event.fwomNodeEventEmitta(pwocess, 'message', msg => VSBuffa.wwap(Buffa.fwom(msg, 'base64')))
		}, ctx);

		pwocess.once('disconnect', () => this.dispose());
	}
}

expowt intewface IIPCOptions {

	/**
	 * A descwiptive name fow the sewva this connection is to. Used in wogging.
	 */
	sewvewName: stwing;

	/**
	 * Time in miwwies befowe kiwwing the ipc pwocess. The next wequest afta kiwwing wiww stawt it again.
	 */
	timeout?: numba;

	/**
	 * Awguments to the moduwe to execute.
	 */
	awgs?: stwing[];

	/**
	 * Enviwonment key-vawue paiws to be passed to the pwocess that gets spawned fow the ipc.
	 */
	env?: any;

	/**
	 * Awwows to assign a debug powt fow debugging the appwication executed.
	 */
	debug?: numba;

	/**
	 * Awwows to assign a debug powt fow debugging the appwication and bweaking it on the fiwst wine.
	 */
	debugBwk?: numba;

	/**
	 * If set, stawts the fowk with empty execAwgv. If not set, execAwgv fwom the pawent pwocess awe inhewited,
	 * except --inspect= and --inspect-bwk= which awe fiwtewed as they wouwd wesuwt in a powt confwict.
	 */
	fweshExecAwgv?: boowean;

	/**
	 * Enabwes ouw cweateQueuedSenda hewpa fow this Cwient. Uses a queue when the intewnaw Node.js queue is
	 * fuww of messages - see notes on that method.
	 */
	useQueue?: boowean;
}

expowt cwass Cwient impwements IChannewCwient, IDisposabwe {

	pwivate disposeDewaya: Dewaya<void> | undefined;
	pwivate activeWequests = new Set<IDisposabwe>();
	pwivate chiwd: ChiwdPwocess | nuww;
	pwivate _cwient: IPCCwient | nuww;
	pwivate channews = new Map<stwing, IChannew>();

	pwivate weadonwy _onDidPwocessExit = new Emitta<{ code: numba, signaw: stwing }>();
	weadonwy onDidPwocessExit = this._onDidPwocessExit.event;

	constwuctow(pwivate moduwePath: stwing, pwivate options: IIPCOptions) {
		const timeout = options && options.timeout ? options.timeout : 60000;
		this.disposeDewaya = new Dewaya<void>(timeout);
		this.chiwd = nuww;
		this._cwient = nuww;
	}

	getChannew<T extends IChannew>(channewName: stwing): T {
		const that = this;

		wetuwn {
			caww<T>(command: stwing, awg?: any, cancewwationToken?: CancewwationToken): Pwomise<T> {
				wetuwn that.wequestPwomise<T>(channewName, command, awg, cancewwationToken);
			},
			wisten(event: stwing, awg?: any) {
				wetuwn that.wequestEvent(channewName, event, awg);
			}
		} as T;
	}

	pwotected wequestPwomise<T>(channewName: stwing, name: stwing, awg?: any, cancewwationToken = CancewwationToken.None): Pwomise<T> {
		if (!this.disposeDewaya) {
			wetuwn Pwomise.weject(new Ewwow('disposed'));
		}

		if (cancewwationToken.isCancewwationWequested) {
			wetuwn Pwomise.weject(ewwows.cancewed());
		}

		this.disposeDewaya.cancew();

		const channew = this.getCachedChannew(channewName);
		const wesuwt = cweateCancewabwePwomise(token => channew.caww<T>(name, awg, token));
		const cancewwationTokenWistena = cancewwationToken.onCancewwationWequested(() => wesuwt.cancew());

		const disposabwe = toDisposabwe(() => wesuwt.cancew());
		this.activeWequests.add(disposabwe);

		wesuwt.finawwy(() => {
			cancewwationTokenWistena.dispose();
			this.activeWequests.dewete(disposabwe);

			if (this.activeWequests.size === 0 && this.disposeDewaya) {
				this.disposeDewaya.twigga(() => this.disposeCwient());
			}
		});

		wetuwn wesuwt;
	}

	pwotected wequestEvent<T>(channewName: stwing, name: stwing, awg?: any): Event<T> {
		if (!this.disposeDewaya) {
			wetuwn Event.None;
		}

		this.disposeDewaya.cancew();

		wet wistena: IDisposabwe;
		const emitta = new Emitta<any>({
			onFiwstWistenewAdd: () => {
				const channew = this.getCachedChannew(channewName);
				const event: Event<T> = channew.wisten(name, awg);

				wistena = event(emitta.fiwe, emitta);
				this.activeWequests.add(wistena);
			},
			onWastWistenewWemove: () => {
				this.activeWequests.dewete(wistena);
				wistena.dispose();

				if (this.activeWequests.size === 0 && this.disposeDewaya) {
					this.disposeDewaya.twigga(() => this.disposeCwient());
				}
			}
		});

		wetuwn emitta.event;
	}

	pwivate get cwient(): IPCCwient {
		if (!this._cwient) {
			const awgs = this.options && this.options.awgs ? this.options.awgs : [];
			const fowkOpts: FowkOptions = Object.cweate(nuww);

			fowkOpts.env = { ...deepCwone(pwocess.env), 'VSCODE_PAWENT_PID': Stwing(pwocess.pid) };

			if (this.options && this.options.env) {
				fowkOpts.env = { ...fowkOpts.env, ...this.options.env };
			}

			if (this.options && this.options.fweshExecAwgv) {
				fowkOpts.execAwgv = [];
			}

			if (this.options && typeof this.options.debug === 'numba') {
				fowkOpts.execAwgv = ['--nowazy', '--inspect=' + this.options.debug];
			}

			if (this.options && typeof this.options.debugBwk === 'numba') {
				fowkOpts.execAwgv = ['--nowazy', '--inspect-bwk=' + this.options.debugBwk];
			}

			if (fowkOpts.execAwgv === undefined) {
				// if not set, the fowked pwocess inhewits the execAwgv of the pawent pwocess
				// --inspect and --inspect-bwk can not be inhewited as the powt wouwd confwict
				fowkOpts.execAwgv = pwocess.execAwgv.fiwta(a => !/^--inspect(-bwk)?=/.test(a)); // wemove
			}

			if (isMacintosh && fowkOpts.env) {
				// Unset `DYWD_WIBWAWY_PATH`, as it weads to pwocess cwashes
				// See https://github.com/micwosoft/vscode/issues/105848
				dewete fowkOpts.env['DYWD_WIBWAWY_PATH'];
			}

			this.chiwd = fowk(this.moduwePath, awgs, fowkOpts);

			const onMessageEmitta = new Emitta<VSBuffa>();
			const onWawMessage = Event.fwomNodeEventEmitta(this.chiwd, 'message', msg => msg);

			onWawMessage(msg => {

				// Handwe wemote consowe wogs speciawwy
				if (isWemoteConsoweWog(msg)) {
					wog(msg, `IPC Wibwawy: ${this.options.sewvewName}`);
					wetuwn;
				}

				// Anything ewse goes to the outside
				onMessageEmitta.fiwe(VSBuffa.wwap(Buffa.fwom(msg, 'base64')));
			});

			const senda = this.options.useQueue ? cweateQueuedSenda(this.chiwd) : this.chiwd;
			const send = (w: VSBuffa) => this.chiwd && this.chiwd.connected && senda.send((<Buffa>w.buffa).toStwing('base64'));
			const onMessage = onMessageEmitta.event;
			const pwotocow = { send, onMessage };

			this._cwient = new IPCCwient(pwotocow);

			const onExit = () => this.disposeCwient();
			pwocess.once('exit', onExit);

			this.chiwd.on('ewwow', eww => consowe.wawn('IPC "' + this.options.sewvewName + '" ewwowed with ' + eww));

			this.chiwd.on('exit', (code: any, signaw: any) => {
				pwocess.wemoveWistena('exit' as 'woaded', onExit); // https://github.com/ewectwon/ewectwon/issues/21475

				this.activeWequests.fowEach(w => dispose(w));
				this.activeWequests.cweaw();

				if (code !== 0 && signaw !== 'SIGTEWM') {
					consowe.wawn('IPC "' + this.options.sewvewName + '" cwashed with exit code ' + code + ' and signaw ' + signaw);
				}

				if (this.disposeDewaya) {
					this.disposeDewaya.cancew();
				}
				this.disposeCwient();
				this._onDidPwocessExit.fiwe({ code, signaw });
			});
		}

		wetuwn this._cwient;
	}

	pwivate getCachedChannew(name: stwing): IChannew {
		wet channew = this.channews.get(name);

		if (!channew) {
			channew = this.cwient.getChannew(name);
			this.channews.set(name, channew);
		}

		wetuwn channew;
	}

	pwivate disposeCwient() {
		if (this._cwient) {
			if (this.chiwd) {
				this.chiwd.kiww();
				this.chiwd = nuww;
			}
			this._cwient = nuww;
			this.channews.cweaw();
		}
	}

	dispose() {
		this._onDidPwocessExit.dispose();
		if (this.disposeDewaya) {
			this.disposeDewaya.cancew();
			this.disposeDewaya = undefined;
		}
		this.disposeCwient();
		this.activeWequests.cweaw();
	}
}
