/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  RoboAgent — Debug adapter location/detection (WS4)
 *
 *  Python: a vendored `debugpy` may live under `debugAdapters/debugpy/` (fetched at build
 *  time — not wired up yet, see the task board); when present, its PARENT dir goes on
 *  PYTHONPATH so `import debugpy` resolves. Otherwise we rely on a system-installed debugpy
 *  and probe for it before claiming Python debugging works.
 *
 *  C++: per project decision we do NOT ship a large native adapter. We detect a system
 *  `lldb-dap` (LLVM's DAP). If present we use it; otherwise the command layer falls back to a
 *  terminal `ros2 run`. (Vendoring codelldb at build time remains a future option.)
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execOk, onPath } from './util';

/**
 * The directory to put on PYTHONPATH when debugpy is vendored, i.e. the parent of the
 * `debugpy` package (`debugAdapters/`). Undefined when not vendored — detected by the
 * package's `__init__.py`, not by bare directory existence.
 */
export async function vendoredDebugpyPythonPath(context: vscode.ExtensionContext): Promise<string | undefined> {
	const marker = vscode.Uri.joinPath(context.extensionUri, 'debugAdapters', 'debugpy', '__init__.py');
	try {
		await vscode.workspace.fs.stat(marker);
		return vscode.Uri.joinPath(context.extensionUri, 'debugAdapters').fsPath;
	} catch {
		return undefined;
	}
}

/**
 * The `DebugAdapterExecutable` for Python. Prefers the vendored debugpy via PYTHONPATH; when not
 * vendored, relies on a system-installed debugpy (`python3 -m debugpy.adapter`).
 */
export async function pythonAdapterExecutable(context: vscode.ExtensionContext): Promise<vscode.DebugAdapterExecutable> {
	const vendoredPythonPath = await vendoredDebugpyPythonPath(context);
	const options: vscode.DebugAdapterExecutableOptions | undefined = vendoredPythonPath
		? { env: { PYTHONPATH: vendoredPythonPath } }
		: undefined;
	return new vscode.DebugAdapterExecutable('python3', ['-m', 'debugpy.adapter'], options);
}

/** True when Python debugging can actually run (vendored debugpy or a system one). */
export async function pythonDebugAvailable(context: vscode.ExtensionContext): Promise<boolean> {
	if (await vendoredDebugpyPythonPath(context)) {
		return true;
	}
	return execOk('python3 -c "import debugpy"');
}

/** The system C++ DAP executable (`lldb-dap`), or undefined if none is installed. */
export async function systemCppAdapter(): Promise<vscode.DebugAdapterExecutable | undefined> {
	if (await onPath('lldb-dap')) {
		return new vscode.DebugAdapterExecutable('lldb-dap');
	}
	// Older LLVM shipped the binary as `lldb-vscode`.
	if (await onPath('lldb-vscode')) {
		return new vscode.DebugAdapterExecutable('lldb-vscode');
	}
	return undefined;
}
