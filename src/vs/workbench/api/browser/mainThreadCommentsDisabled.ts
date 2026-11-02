/*---------------------------------------------------------------------------------------------
 *  Disabled Comments API bridge for profiles without review support.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadCommentsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadComments)
export class MainThreadCommentsDisabled extends Disposable implements MainThreadCommentsShape {
	constructor(_context: IExtHostContext) {
		super();
	}

	$registerCommentController(..._args: Parameters<MainThreadCommentsShape['$registerCommentController']>): void { }
	$unregisterCommentController(..._args: Parameters<MainThreadCommentsShape['$unregisterCommentController']>): void { }
	$updateCommentControllerFeatures(..._args: Parameters<MainThreadCommentsShape['$updateCommentControllerFeatures']>): void { }
	$createCommentThread(..._args: Parameters<MainThreadCommentsShape['$createCommentThread']>): ReturnType<MainThreadCommentsShape['$createCommentThread']> { return undefined; }
	$updateCommentThread(..._args: Parameters<MainThreadCommentsShape['$updateCommentThread']>): void { }
	$deleteCommentThread(..._args: Parameters<MainThreadCommentsShape['$deleteCommentThread']>): void { }
	$updateCommentingRanges(..._args: Parameters<MainThreadCommentsShape['$updateCommentingRanges']>): void { }
	$revealCommentThread(..._args: Parameters<MainThreadCommentsShape['$revealCommentThread']>): Promise<void> { return Promise.resolve(); }
	$hideCommentThread(..._args: Parameters<MainThreadCommentsShape['$hideCommentThread']>): void { }
}
