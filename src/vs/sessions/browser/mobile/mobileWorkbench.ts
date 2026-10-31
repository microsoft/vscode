/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { SessionsLayoutPolicy } from '../layoutPolicy.js';
import { IWorkbenchOptions, Workbench } from '../workbench.js';
import { MobileWorkbench as BaseMobileWorkbench } from '../mobileWorkbench.js';
import { ExperimentalMobileTitlebarPart } from './experimentalMobileTitlebarPart.js';

/**
 * CSS class that marks the main container of the mobile workbench. Mobile-only
 * stylesheets (`media/*.css`, loaded last by `contrib/mobile/browser/mobile.contribution.ts`
 * so they are the final word in the cascade) target this class instead of
 * overriding desktop rules under `.phone-layout`, so the phone presentation is
 * additive rather than subtractive.
 */
export const MOBILE_WORKBENCH_CLASS = 'mobile-workbench';

/**
 * The phone presentation of the Agents Window.
 *
 * The mobile workbench is selected by the mobile web entry point
 * (`sessions.web.mobile.main.ts`), never by measuring the window or sniffing
 * the user agent at runtime. It fixes the viewport class to `phone` for the
 * lifetime of the window, which makes every downstream consumer of
 * {@link Workbench.viewportClass} — part factories, layout controllers,
 * pickers, and `IsPhoneLayoutContext` — agree on the presentation from the
 * first layout pass, and disables the desktop-to-phone morphing that the shared
 * workbench performs when a viewport crosses the phone breakpoint.
 *
 * It shares the session model, services, providers, and chat widget with the
 * desktop workbench; only composition and presentation differ.
 */
export class MobileWorkbench extends BaseMobileWorkbench {
	readonly initialViewportClass = 'phone';

	protected override createLayoutPolicy(): SessionsLayoutPolicy {
		return new SessionsLayoutPolicy('phone');
	}

	protected override createMobileTitlebarPart(instantiationService: IInstantiationService): ExperimentalMobileTitlebarPart {
		return instantiationService.createInstance(ExperimentalMobileTitlebarPart, this.mainContainer);
	}

	override getLayoutClasses(): string[] {
		return [...super.getLayoutClasses(), MOBILE_WORKBENCH_CLASS];
	}
}

/**
 * Creates the mobile workbench. Passed to the web bootstrap by the mobile
 * entry point in place of the desktop `createSessionsWorkbench` factory.
 */
export function createMobileSessionsWorkbench(parent: HTMLElement, options: IWorkbenchOptions | undefined, serviceCollection: ServiceCollection, logService: ILogService): Workbench {
	return new MobileWorkbench(parent, options, serviceCollection, logService);
}
