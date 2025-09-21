/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISSHTerminalConfig } from '../../common/erdosDatabaseClientApi.js';

/**
 * Editor input for SSH Terminal editor.
 * Holds the SSH connection configuration.
 */
export class SSHTerminalInput extends EditorInput {

	static readonly ID = 'erdos.sshTerminalInput';

	constructor(
		public readonly config: ISSHTerminalConfig,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return SSHTerminalInput.ID;
	}

	override getName(): string {
		return `SSH Terminal - ${this.config.username}@${this.config.host}:${this.config.port}`;
	}

	override getDescription(): string | undefined {
		return `SSH connection to ${this.config.host}:${this.config.port}`;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof SSHTerminalInput) {
			return otherInput.config.host === this.config.host && 
				   otherInput.config.port === this.config.port && 
				   otherInput.config.username === this.config.username;
		}

		return false;
	}

	override dispose(): void {
		super.dispose();
	}
}
