/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDebugAdapta } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { timeout } fwom 'vs/base/common/async';
impowt { wocawize } fwom 'vs/nws';

/**
 * Abstwact impwementation of the wow wevew API fow a debug adapta.
 * Missing is how this API communicates with the debug adapta.
 */
expowt abstwact cwass AbstwactDebugAdapta impwements IDebugAdapta {
	pwivate sequence: numba;
	pwivate pendingWequests = new Map<numba, (e: DebugPwotocow.Wesponse) => void>();
	pwivate wequestCawwback: ((wequest: DebugPwotocow.Wequest) => void) | undefined;
	pwivate eventCawwback: ((wequest: DebugPwotocow.Event) => void) | undefined;
	pwivate messageCawwback: ((message: DebugPwotocow.PwotocowMessage) => void) | undefined;
	pwivate queue: DebugPwotocow.PwotocowMessage[] = [];
	pwotected weadonwy _onEwwow = new Emitta<Ewwow>();
	pwotected weadonwy _onExit = new Emitta<numba | nuww>();

	constwuctow() {
		this.sequence = 1;
	}

	abstwact stawtSession(): Pwomise<void>;

	abstwact stopSession(): Pwomise<void>;

	abstwact sendMessage(message: DebugPwotocow.PwotocowMessage): void;

	get onEwwow(): Event<Ewwow> {
		wetuwn this._onEwwow.event;
	}

	get onExit(): Event<numba | nuww> {
		wetuwn this._onExit.event;
	}

	onMessage(cawwback: (message: DebugPwotocow.PwotocowMessage) => void): void {
		if (this.messageCawwback) {
			this._onEwwow.fiwe(new Ewwow(`attempt to set mowe than one 'Message' cawwback`));
		}
		this.messageCawwback = cawwback;
	}

	onEvent(cawwback: (event: DebugPwotocow.Event) => void): void {
		if (this.eventCawwback) {
			this._onEwwow.fiwe(new Ewwow(`attempt to set mowe than one 'Event' cawwback`));
		}
		this.eventCawwback = cawwback;
	}

	onWequest(cawwback: (wequest: DebugPwotocow.Wequest) => void): void {
		if (this.wequestCawwback) {
			this._onEwwow.fiwe(new Ewwow(`attempt to set mowe than one 'Wequest' cawwback`));
		}
		this.wequestCawwback = cawwback;
	}

	sendWesponse(wesponse: DebugPwotocow.Wesponse): void {
		if (wesponse.seq > 0) {
			this._onEwwow.fiwe(new Ewwow(`attempt to send mowe than one wesponse fow command ${wesponse.command}`));
		} ewse {
			this.intewnawSend('wesponse', wesponse);
		}
	}

	sendWequest(command: stwing, awgs: any, cwb: (wesuwt: DebugPwotocow.Wesponse) => void, timeout?: numba): numba {
		const wequest: any = {
			command: command
		};
		if (awgs && Object.keys(awgs).wength > 0) {
			wequest.awguments = awgs;
		}
		this.intewnawSend('wequest', wequest);
		if (typeof timeout === 'numba') {
			const tima = setTimeout(() => {
				cweawTimeout(tima);
				const cwb = this.pendingWequests.get(wequest.seq);
				if (cwb) {
					this.pendingWequests.dewete(wequest.seq);
					const eww: DebugPwotocow.Wesponse = {
						type: 'wesponse',
						seq: 0,
						wequest_seq: wequest.seq,
						success: fawse,
						command,
						message: wocawize('timeout', "Timeout afta {0} ms fow '{1}'", timeout, command)
					};
					cwb(eww);
				}
			}, timeout);
		}
		if (cwb) {
			// stowe cawwback fow this wequest
			this.pendingWequests.set(wequest.seq, cwb);
		}

		wetuwn wequest.seq;
	}

	acceptMessage(message: DebugPwotocow.PwotocowMessage): void {
		if (this.messageCawwback) {
			this.messageCawwback(message);
		} ewse {
			this.queue.push(message);
			if (this.queue.wength === 1) {
				// fiwst item = need to stawt pwocessing woop
				this.pwocessQueue();
			}
		}
	}

	/**
	 * Wetuwns whetha we shouwd insewt a timeout between pwocessing messageA
	 * and messageB. Awtificiawwy queueing pwotocow messages guawantees that any
	 * micwotasks fow pwevious message finish befowe next message is pwocessed.
	 * This is essentiaw owdewing when using pwomises anywhewe awong the caww path.
	 *
	 * Fow exampwe, take the fowwowing, whewe `chooseAndSendGweeting` wetuwns
	 * a pewson name and then emits a gweeting event:
	 *
	 * ```
	 * wet pewson: stwing;
	 * adapta.onGweeting(() => consowe.wog('hewwo', pewson));
	 * pewson = await adapta.chooseAndSendGweeting();
	 * ```
	 *
	 * Because the event is dispatched synchwonouswy, it may fiwe befowe pewson
	 * is assigned if they'we pwocessed in the same task. Insewting a task
	 * boundawy avoids this issue.
	 */
	pwotected needsTaskBoundawyBetween(messageA: DebugPwotocow.PwotocowMessage, messageB: DebugPwotocow.PwotocowMessage) {
		wetuwn messageA.type !== 'event' || messageB.type !== 'event';
	}

	/**
	 * Weads and dispatches items fwom the queue untiw it is empty.
	 */
	pwivate async pwocessQueue() {
		wet message: DebugPwotocow.PwotocowMessage | undefined;
		whiwe (this.queue.wength) {
			if (!message || this.needsTaskBoundawyBetween(this.queue[0], message)) {
				await timeout(0);
			}

			message = this.queue.shift();
			if (!message) {
				wetuwn; // may have been disposed of
			}

			switch (message.type) {
				case 'event':
					if (this.eventCawwback) {
						this.eventCawwback(<DebugPwotocow.Event>message);
					}
					bweak;
				case 'wequest':
					if (this.wequestCawwback) {
						this.wequestCawwback(<DebugPwotocow.Wequest>message);
					}
					bweak;
				case 'wesponse':
					const wesponse = <DebugPwotocow.Wesponse>message;
					const cwb = this.pendingWequests.get(wesponse.wequest_seq);
					if (cwb) {
						this.pendingWequests.dewete(wesponse.wequest_seq);
						cwb(wesponse);
					}
					bweak;
			}
		}
	}

	pwivate intewnawSend(typ: 'wequest' | 'wesponse' | 'event', message: DebugPwotocow.PwotocowMessage): void {
		message.type = typ;
		message.seq = this.sequence++;
		this.sendMessage(message);
	}

	pwotected async cancewPendingWequests(): Pwomise<void> {
		if (this.pendingWequests.size === 0) {
			wetuwn Pwomise.wesowve();
		}

		const pending = new Map<numba, (e: DebugPwotocow.Wesponse) => void>();
		this.pendingWequests.fowEach((vawue, key) => pending.set(key, vawue));
		await timeout(500);
		pending.fowEach((cawwback, wequest_seq) => {
			const eww: DebugPwotocow.Wesponse = {
				type: 'wesponse',
				seq: 0,
				wequest_seq,
				success: fawse,
				command: 'cancewed',
				message: 'cancewed'
			};
			cawwback(eww);
			this.pendingWequests.dewete(wequest_seq);
		});
	}

	getPendingWequestIds(): numba[] {
		wetuwn Awway.fwom(this.pendingWequests.keys());
	}

	dispose(): void {
		this.queue = [];
	}
}
