/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

    /**
     * Native event types captured by Code Ship AI Agent
     */
    export type CodeShipNativeEvent =
        | { type: 'keydown'; key: string; modifiers: string[] }
        | { type: 'mousemove'; x: number; y: number };

    /**
     * Handle for managing overlay widgets in the editor
     */
    export interface CodeShipOverlayHandle {
        /**
         * Unique identifier for this overlay
         */
        readonly id: string;

        /**
         * Update the position of the overlay in the editor
         * @param line Line number (1-based)
         * @param column Column number (1-based)
         */
        updatePosition(line: number, column: number): void;

        /**
         * Update the HTML content of the overlay
         * @param html HTML string to render
         */
        updateContent(html: string): void;

        /**
         * Dispose of this overlay and remove it from the editor
         */
        dispose(): void;
    }

    /**
     * Code Ship AI Agent API namespace
     * Provides privileged access to VS Code internals for AI-powered features
     */
    export namespace aiAgent {
        /**
         * Intercept a command before it executes.
         * The handler can prevent the command from executing by returning false.
         *
         * @param commandId The command ID to intercept (e.g., 'workbench.action.files.save')
         * @param handler Async function that returns true to allow execution, false to cancel
         * @returns A disposable that removes the interceptor when disposed
         */
        export function interceptCommand(
            commandId: string,
            handler: (args: any[]) => Promise<boolean>
        ): Disposable;

        /**
         * Request access to create overlay widgets in the editor area.
         * Overlays can display custom HTML content at specific editor positions.
         *
         * @returns A promise that resolves to an overlay handle
         */
        export function requestOverlayAccess(): Promise<CodeShipOverlayHandle>;

        /**
         * Event fired when native events (keyboard, mouse) occur.
         * These events provide low-level access not available through standard VS Code API.
         */
        export const onNativeEvent: Event<CodeShipNativeEvent>;
    }
}
