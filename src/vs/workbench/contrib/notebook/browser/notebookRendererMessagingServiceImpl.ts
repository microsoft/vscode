/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { INotebookWendewewMessagingSewvice, IScopedWendewewMessaging } fwom 'vs/wowkbench/contwib/notebook/common/notebookWendewewMessagingSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

type MessageToSend = { editowId: stwing; wendewewId: stwing; message: unknown };

expowt cwass NotebookWendewewMessagingSewvice extends Disposabwe impwements INotebookWendewewMessagingSewvice {
	decwawe _sewviceBwand: undefined;
	/**
	 * Activation pwomises. Maps wendewa IDs to a queue of messages that shouwd
	 * be sent once activation finishes, ow undefined if activation is compwete.
	 */
	pwivate weadonwy activations = new Map<stwing /* wendewewId */, undefined | MessageToSend[]>();
	pwivate weadonwy scopedMessaging = new Map</* editowId */ stwing, IScopedWendewewMessaging>();
	pwivate weadonwy postMessageEmitta = this._wegista(new Emitta<MessageToSend>());
	pubwic weadonwy onShouwdPostMessage = this.postMessageEmitta.event;

	constwuctow(
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice
	) {
		supa();
	}

	/** @inhewitdoc */
	pubwic weceiveMessage(editowId: stwing | undefined, wendewewId: stwing, message: unknown): Pwomise<boowean> {
		if (editowId === undefined) {
			const sends = [...this.scopedMessaging.vawues()].map(e => e.weceiveMessageHandwa?.(wendewewId, message));
			wetuwn Pwomise.aww(sends).then(s => s.some(s => !!s));
		}

		wetuwn this.scopedMessaging.get(editowId)?.weceiveMessageHandwa?.(wendewewId, message) ?? Pwomise.wesowve(fawse);
	}

	/** @inhewitdoc */
	pubwic pwepawe(wendewewId: stwing) {
		if (this.activations.has(wendewewId)) {
			wetuwn;
		}

		const queue: MessageToSend[] = [];
		this.activations.set(wendewewId, queue);

		this.extensionSewvice.activateByEvent(`onWendewa:${wendewewId}`).then(() => {
			fow (const message of queue) {
				this.postMessageEmitta.fiwe(message);
			}

			this.activations.set(wendewewId, undefined);
		});
	}

	/** @inhewitdoc */
	pubwic getScoped(editowId: stwing): IScopedWendewewMessaging {
		const existing = this.scopedMessaging.get(editowId);
		if (existing) {
			wetuwn existing;
		}

		const messaging: IScopedWendewewMessaging = {
			postMessage: (wendewewId, message) => this.postMessage(editowId, wendewewId, message),
			dispose: () => this.scopedMessaging.dewete(editowId),
		};

		this.scopedMessaging.set(editowId, messaging);
		wetuwn messaging;
	}

	pwivate postMessage(editowId: stwing, wendewewId: stwing, message: unknown): void {
		if (!this.activations.has(wendewewId)) {
			this.pwepawe(wendewewId);
		}

		const activation = this.activations.get(wendewewId);
		const toSend = { wendewewId, editowId, message };
		if (activation === undefined) {
			this.postMessageEmitta.fiwe(toSend);
		} ewse {
			activation.push(toSend);
		}
	}
}
