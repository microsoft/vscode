/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { Logger, logger } from './logger';
import { isAbortError } from './networking';
import { ICompletionsStatusReporter } from './progress';

const oomCodes = new Set(['ERR_WORKER_OUT_OF_MEMORY', 'ENOMEM']);

function isOomError(error: NodeJS.ErrnoException) {
	return (
		oomCodes.has(error.code ?? '') ||
		// happens in loadWasmLanguage
		(error.name === 'RangeError' && error.message === 'WebAssembly.Memory(): could not allocate memory')
	);
}

export function handleException(accessor: ServicesAccessor, err: unknown, origin: string, _logger: Logger = logger): void {
	if (isAbortError(err)) {
		// ignore cancelled fetch requests
		return;
	}
	const statusReporter = accessor.get(ICompletionsStatusReporter);
	if (err instanceof Error) {
		const error = err as NodeJS.ErrnoException;
		if (isOomError(error)) {
			statusReporter.setWarning('Out of memory');
		} else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
			statusReporter.setWarning('Too many open files');
		} else if (error.code === 'CopilotPromptLoadFailure') {
			statusReporter.setWarning('Corrupted Copilot installation');
		} else if (`${error.code}`.startsWith('CopilotPromptWorkerExit')) {
			statusReporter.setWarning('Worker unexpectedly exited');
		} else if (error.syscall === 'uv_cwd' && error.code === 'ENOENT') {
			statusReporter.setWarning('Current working directory does not exist');
		}
	}
	_logger.exception(accessor, err, origin);
}
