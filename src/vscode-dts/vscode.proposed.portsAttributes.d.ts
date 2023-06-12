/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/115616 @alexr00

	/**
	 * The action that should be taken when a port is discovered through automatic port forwarding discovery.
	 */
	export enum PortAutoForwardAction {
		/**
		 * Notify the user that the port is being forwarded. This is the default action.
		 */
		Notify = 1,
		/**
		 * Once the port is forwarded, open the browser to the forwarded port.
		 */
		OpenBrowser = 2,
		/**
		 * Once the port is forwarded, open the preview browser to the forwarded port.
		 */
		OpenPreview = 3,
		/**
		 * Forward the port silently.
		 */
		Silent = 4,
		/**
		 * Do not forward the port.
		 */
		Ignore = 5,
		/**
		 * Once the port is forwarded, open the browser to the forwarded port. Only open the browser the first time the port is forwarded in a session.
		 */
		OpenBrowserOnce = 6
	}

	/**
	 * The attributes that a forwarded port can have.
	 */
	export class PortAttributes {
		/**
		 * The action to be taken when this port is detected for auto forwarding.
		 */
		autoForwardAction: PortAutoForwardAction;

		/**
		 * Creates a new PortAttributes object
		 * @param port the port number
		 * @param autoForwardAction the action to take when this port is detected
		 */
		constructor(autoForwardAction: PortAutoForwardAction);
	}

	/**
	 * A provider of port attributes. Port attributes are used to determine what action should be taken when a port is discovered.
	 */
	export interface PortAttributesProvider {
		/**
		 * Provides attributes for the given port. For ports that your extension doesn't know about, simply
		 * return undefined. For example, if `providePortAttributes` is called with ports 3000 but your
		 * extension doesn't know anything about 3000 you should return undefined.
		 */
		providePortAttributes(port: number, pid: number | undefined, commandLine: string | undefined, token: CancellationToken): ProviderResult<PortAttributes>;
	}

	/**
	 * A selector that will be used to filter which {@link PortAttributesProvider} should be called for each port.
	 */
	export interface PortAttributesSelector {
		/**
		 * Specifying a port range will cause your provider to only be called for ports within the range.
		 * The start is inclusive and the end is exclusive.
		 */
		portRange?: [number, number] | number;

		/**
		 * Specifying a command pattern will cause your provider to only be called for processes whose command line matches the pattern.
		 */
		commandPattern?: RegExp;
	}

	export namespace workspace {
		/**
		 * If your extension listens on ports, consider registering a PortAttributesProvider to provide information
		 * about the ports. For example, a debug extension may know about debug ports in it's debuggee. By providing
		 * this information with a PortAttributesProvider the extension can tell the editor that these ports should be
		 * ignored, since they don't need to be user facing.
		 *
		 * The results of the PortAttributesProvider are merged with the user setting `remote.portsAttributes`. If the values conflict, the user setting takes precedence.
		 *
		 * @param portSelector It is best practice to specify a port selector to avoid unnecessary calls to your provider.
		 * If you don't specify a port selector your provider will be called for every port, which will result in slower port forwarding for the user.
		 * @param provider The {@link PortAttributesProvider PortAttributesProvider}.
		 */
		export function registerPortAttributesProvider(portSelector: PortAttributesSelector, provider: PortAttributesProvider): Disposable;
	}
}
