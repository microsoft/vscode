import { EventEmitter } from 'events';

interface FilterNever<T> { }
interface RendererEvents { }
interface TypedEmitter<T> {
	emit(emit: string): void;
	removeAllListeners(): void;
	removeListener(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter;
	once(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter;
	on(eventName: string | symbol, listener: (...args: any[]) => void): EventEmitter
}

class IpcRendererWithCommands {
	constructor() { }

	on(event: string, callback: (arg: any) => void) {
		throw new Error('Method not implemented.');
	}

	removeAllListeners(id: string) { }
}

export default class Client {
	emitter: TypedEmitter<RendererEvents>;
	ipc: IpcRendererWithCommands;
	id!: string;

	constructor(ipcRenderer: IpcRendererWithCommands) {
		this.emitter = new EventEmitter();
		this.ipc = ipcRenderer;
		this.emit = this.emit.bind(this);
		if ('__rpcId' in window) {
			this.id = window.__rpcId as string;
			this.ipc.on(this.id, () => {
				// finish
			});
			this.emitter.emit('ready');
		} else {
			this.ipc.on('init', (uid: string) => {
				// we cache so that if the object
				// gets re-instantiated we don't
				// wait for a `init` event
				// window.profileName = profileName;
				this.id = uid;
				this.emitter.emit('ready');
			});
		}
	}

	on = <U extends keyof RendererEvents>(ev: U, fn: (arg0: string[]) => void) => {
		this.emitter.on(ev, fn);
		return this;
	};

	once = <U extends keyof RendererEvents>(ev: U, fn: (arg0: string[]) => void) => {
		this.emitter.once(ev, fn);
		return this;
	};

	emit<U extends Exclude<string[], FilterNever<string[]>>>(ev: U): boolean;
	emit<U extends FilterNever<string[]>>(ev: U, data: string[]): boolean;
	emit<U extends keyof string[]>(ev: U, data?: string[]) {
		if (!this.id) {
			throw new Error('Not ready');
		}
		this.ipc.send(this.id, { ev, data });
		return true;
	}

	removeListener = <U extends keyof RendererEvents>(ev: U, fn: (arg0: string[]) => void) => {
		this.emitter.removeListener(ev, fn);
		return this;
	};

	removeAllListeners = () => {
		this.emitter.removeAllListeners();
		return this;
	};

	destroy = () => {
		this.removeAllListeners();
		this.ipc.removeAllListeners(this.id);
	};
}
