/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/* REDIS INPUT COMMENTED OUT
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRedisKey } from '../../common/erdosDatabaseClientApi.js';

export class RedisKeyInput extends EditorInput {

	static readonly ID = 'erdos.redisKeyInput';

	constructor(
		public readonly connectionId: string,
		public readonly keyName: string,
		public initialKeyData: IRedisKey | undefined,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return RedisKeyInput.ID;
	}

	override getName(): string {
		return `Redis Key - ${this.keyName}`;
	}

	override getDescription(): string | undefined {
		return this.connectionId;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof RedisKeyInput) {
			return otherInput.connectionId === this.connectionId &&
				   otherInput.keyName === this.keyName;
		}

		return false;
	}

	public updateKeyData(keyData: IRedisKey): void {
		this.initialKeyData = keyData;
		this._onDidChangeLabel.fire();
	}

	override dispose(): void {
		super.dispose();
	}
}
END REDIS INPUT COMMENTED OUT */
