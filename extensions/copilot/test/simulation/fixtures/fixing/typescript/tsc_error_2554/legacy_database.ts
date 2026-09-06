import { connectLegacy } from './database_mock';
export class LegacyDatabaseAdapter {

	height: number | undefined;

	constructor() { }

	setup() {
		this._storeHeight(0);
		connectLegacy('192.168.0.1', 1000, false);
	}

	_storeHeight(height: number) {
		this.height = height;
	}
}
