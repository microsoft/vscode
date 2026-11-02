/*---------------------------------------------------------------------------------------------
 *  Disabled Notebook API bridges for profiles without notebook support.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import {
	MainContext,
	MainThreadNotebookDocumentsShape,
	MainThreadNotebookEditorsShape,
	MainThreadNotebookKernelsShape,
	MainThreadNotebookRenderersShape,
	MainThreadNotebookShape,
	MainThreadInteractiveShape,
} from '../common/extHost.protocol.js';

const unsupported = (): Error => new Error('Notebook support is disabled in this build.');

@extHostNamedCustomer(MainContext.MainThreadNotebook)
export class MainThreadNotebookDisabled extends Disposable implements MainThreadNotebookShape {
	constructor(_context: IExtHostContext) { super(); }
	$registerNotebookSerializer(..._args: Parameters<MainThreadNotebookShape['$registerNotebookSerializer']>): void { }
	$unregisterNotebookSerializer(..._args: Parameters<MainThreadNotebookShape['$unregisterNotebookSerializer']>): void { }
	$registerNotebookCellStatusBarItemProvider(..._args: Parameters<MainThreadNotebookShape['$registerNotebookCellStatusBarItemProvider']>): Promise<void> { return Promise.resolve(); }
	$unregisterNotebookCellStatusBarItemProvider(..._args: Parameters<MainThreadNotebookShape['$unregisterNotebookCellStatusBarItemProvider']>): Promise<void> { return Promise.resolve(); }
	$emitCellStatusBarEvent(..._args: Parameters<MainThreadNotebookShape['$emitCellStatusBarEvent']>): void { }
}

@extHostNamedCustomer(MainContext.MainThreadNotebookEditors)
export class MainThreadNotebookEditorsDisabled extends Disposable implements MainThreadNotebookEditorsShape {
	constructor(_context: IExtHostContext) { super(); }
	$tryShowNotebookDocument(..._args: Parameters<MainThreadNotebookEditorsShape['$tryShowNotebookDocument']>): Promise<string> { return Promise.reject(unsupported()); }
	$tryRevealRange(..._args: Parameters<MainThreadNotebookEditorsShape['$tryRevealRange']>): Promise<void> { return Promise.reject(unsupported()); }
	$trySetSelections(..._args: Parameters<MainThreadNotebookEditorsShape['$trySetSelections']>): void { }
}

@extHostNamedCustomer(MainContext.MainThreadNotebookDocuments)
export class MainThreadNotebookDocumentsDisabled extends Disposable implements MainThreadNotebookDocumentsShape {
	constructor(_context: IExtHostContext) { super(); }
	$tryCreateNotebook(..._args: Parameters<MainThreadNotebookDocumentsShape['$tryCreateNotebook']>): Promise<never> { return Promise.reject(unsupported()); }
	$tryOpenNotebook(..._args: Parameters<MainThreadNotebookDocumentsShape['$tryOpenNotebook']>): Promise<never> { return Promise.reject(unsupported()); }
	$trySaveNotebook(..._args: Parameters<MainThreadNotebookDocumentsShape['$trySaveNotebook']>): Promise<boolean> { return Promise.reject(unsupported()); }
}

@extHostNamedCustomer(MainContext.MainThreadNotebookKernels)
export class MainThreadNotebookKernelsDisabled extends Disposable implements MainThreadNotebookKernelsShape {
	constructor(_context: IExtHostContext) { super(); }
	$postMessage(..._args: Parameters<MainThreadNotebookKernelsShape['$postMessage']>): Promise<boolean> { return Promise.resolve(false); }
	$addKernel(..._args: Parameters<MainThreadNotebookKernelsShape['$addKernel']>): Promise<void> { return Promise.reject(unsupported()); }
	$updateKernel(..._args: Parameters<MainThreadNotebookKernelsShape['$updateKernel']>): void { }
	$removeKernel(..._args: Parameters<MainThreadNotebookKernelsShape['$removeKernel']>): void { }
	$updateNotebookPriority(..._args: Parameters<MainThreadNotebookKernelsShape['$updateNotebookPriority']>): void { }
	$createExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$createExecution']>): void { }
	$updateExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$updateExecution']>): void { }
	$completeExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$completeExecution']>): void { }
	$createNotebookExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$createNotebookExecution']>): void { }
	$beginNotebookExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$beginNotebookExecution']>): void { }
	$completeNotebookExecution(..._args: Parameters<MainThreadNotebookKernelsShape['$completeNotebookExecution']>): void { }
	$addKernelDetectionTask(..._args: Parameters<MainThreadNotebookKernelsShape['$addKernelDetectionTask']>): Promise<void> { return Promise.reject(unsupported()); }
	$removeKernelDetectionTask(..._args: Parameters<MainThreadNotebookKernelsShape['$removeKernelDetectionTask']>): void { }
	$addKernelSourceActionProvider(..._args: Parameters<MainThreadNotebookKernelsShape['$addKernelSourceActionProvider']>): Promise<void> { return Promise.reject(unsupported()); }
	$removeKernelSourceActionProvider(..._args: Parameters<MainThreadNotebookKernelsShape['$removeKernelSourceActionProvider']>): void { }
	$emitNotebookKernelSourceActionsChangeEvent(..._args: Parameters<MainThreadNotebookKernelsShape['$emitNotebookKernelSourceActionsChangeEvent']>): void { }
	$receiveVariable(..._args: Parameters<MainThreadNotebookKernelsShape['$receiveVariable']>): void { }
	$variablesUpdated(..._args: Parameters<MainThreadNotebookKernelsShape['$variablesUpdated']>): void { }
}

@extHostNamedCustomer(MainContext.MainThreadNotebookRenderers)
export class MainThreadNotebookRenderersDisabled extends Disposable implements MainThreadNotebookRenderersShape {
	constructor(_context: IExtHostContext) { super(); }
	$postMessage(..._args: Parameters<MainThreadNotebookRenderersShape['$postMessage']>): Promise<boolean> { return Promise.resolve(false); }
}

@extHostNamedCustomer(MainContext.MainThreadInteractive)
export class MainThreadInteractiveDisabled extends Disposable implements MainThreadInteractiveShape {
	constructor(_context: IExtHostContext) { super(); }
}
