/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISSHTerminalConfig } from '../../common/erdosDatabaseClientApi.js';

/**
 * Editor input for Port Forwarding editor.
 * Holds the connection information and SSH configuration.
 */
export class PortForwardingInput extends EditorInput {

	static readonly ID = 'erdos.portForwardingInput';

	constructor(
		public readonly connectionId: string,
		public readonly sshConfig: ISSHTerminalConfig | undefined,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return PortForwardingInput.ID;
	}

	override getName(): string {
		return `Port Forwarding - ${this.connectionId}`;
	}

	override getDescription(): string | undefined {
		if (this.sshConfig) {
			return `SSH: ${this.sshConfig.username}@${this.sshConfig.host}:${this.sshConfig.port}`;
		}
		return this.connectionId;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof PortForwardingInput) {
			return otherInput.connectionId === this.connectionId;
		}

		return false;
	}

	override dispose(): void {
		super.dispose();
	}
}
