/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { SimpleRPC } from '../src/extension/onboardDebug/node/copilotDebugWorker/rpc';
import { createServiceIdentifier } from '../src/util/common/services';
import { Output, STDOUT_FILENAME } from './simulation/shared/sharedTypes';


export const IJSONOutputPrinter = createServiceIdentifier<IJSONOutputPrinter>('IJSONOutputPrinter');

export interface IJSONOutputPrinter {
	readonly _serviceBrand: undefined;
	flush?(outputPath: string): Promise<void>;
	print(obj: Output): void;
}

export class ConsoleJSONOutputPrinter implements IJSONOutputPrinter {
	declare readonly _serviceBrand: undefined;

	print(obj: Output): void {
		console.log(JSON.stringify(obj));
	}
}

export class CollectingJSONOutputPrinter implements IJSONOutputPrinter {
	declare readonly _serviceBrand: undefined;

	private readonly outputs: Output[] = [];

	print(obj: Output): void {
		this.outputs.push(obj);
	}

	async flush(outputPath: string): Promise<void> {
		const filePath = path.join(outputPath, STDOUT_FILENAME);
		await fs.promises.writeFile(filePath, JSON.stringify(this.outputs, null, '\t'));
	}
}

export class NoopJSONOutputPrinter implements IJSONOutputPrinter {
	declare readonly _serviceBrand: undefined;

	print(obj: Output): void {
		// noop
	}
}

export class ProxiedSONOutputPrinter implements IJSONOutputPrinter {
	declare readonly _serviceBrand: undefined;

	public static registerTo(instance: IJSONOutputPrinter, rpc: SimpleRPC): IJSONOutputPrinter {
		rpc.registerMethod('ProxiedJSONOutputPrinter.print', (obj: Output) => instance.print(obj));
		rpc.registerMethod('ProxiedJSONOutputPrinter.flush', (outputPath: string) => instance.flush?.(outputPath));
		return instance;
	}

	constructor(
		private readonly rpc: SimpleRPC,
	) { }

	print(obj: Output): void {
		this.rpc.callMethod('ProxiedJSONOutputPrinter.print', obj);
	}

	async flush(outputPath: string): Promise<void> {
		await this.rpc.callMethod('ProxiedJSONOutputPrinter.flush', outputPath);
	}
}
