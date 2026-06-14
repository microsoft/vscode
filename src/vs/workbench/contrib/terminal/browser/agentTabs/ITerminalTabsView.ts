/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork seam — see SEAM_MANIFEST.md (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import type { TerminalTabbedView } from '../terminalTabbedView.js';

/**
 * The single seam between {@link TerminalViewPane} and the tabbed view it owns.
 *
 * It captures *exactly* the public surface the view pane (and the public
 * `terminalTabbedView` getter's consumers) rely on. Both the stock
 * `TerminalTabbedView` and the fork's `AgentTerminalTabbedView` satisfy it, so
 * the pane can create either one behind a config flag without any other change.
 *
 * Keeping this as an interface — rather than editing `terminalTabbedView.ts` to
 * add an `implements` clause — is deliberate: it keeps the upstream conflict
 * surface to `terminalView.ts` alone (the stock view satisfies this interface
 * *structurally*, proved at compile time below).
 */
export interface ITerminalTabsView extends IDisposable {
	rerenderTabs(): void;
	layout(width: number, height: number): void;
	setEditable(isEditing: boolean): void;
	focusTabs(): void;
	focus(): void;
	focusHover(): void;
}

// Compile-time proof that the stock TerminalTabbedView structurally satisfies
// the seam WITHOUT editing it. If upstream changes the view's public surface in
// a way that breaks the seam, this fails to compile — a loud, catchable canary
// (the real fork risk is interface drift, not file churn). See SEAM_MANIFEST.md.
type AssertStockViewSatisfiesSeam = TerminalTabbedView extends ITerminalTabsView ? true : never;
const _stockViewSatisfiesSeam: AssertStockViewSatisfiesSeam = true;
void _stockViewSatisfiesSeam;
