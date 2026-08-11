/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PageApiSandboxBridge = {
	createFunction(callback: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
	createArray(): unknown[];
	createObject(): Record<PropertyKey, unknown>;
	throwError(message: string): never;
};

export function clonePageApiArguments(value: unknown, bridge: PageApiSandboxBridge, seen = new WeakMap<object, unknown>()): unknown {
	if (value === null || typeof value !== 'object') {
		return value;
	}
	const existing = seen.get(value);
	if (existing !== undefined) {
		return existing;
	}
	if (Array.isArray(value)) {
		const result = bridge.createArray();
		seen.set(value, result);
		result.push(...value.map(item => clonePageApiArguments(item, bridge, seen)));
		return result;
	}
	const result = bridge.createObject();
	seen.set(value, result);
	for (const key of Reflect.ownKeys(value)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		if (descriptor?.enumerable) {
			result[key] = clonePageApiArguments(Reflect.get(value, key), bridge, seen);
		}
	}
	return result;
}

const PAGE_PROXY_SERIALIZED_CALLBACK_METHODS = new Set(['$eval', '$$eval', 'addInitScript', 'evaluate', 'evaluateAll', 'evaluateHandle', 'waitForFunction']);

type PageApiProxyContext = {
	readonly proxies: WeakMap<object, object>;
	readonly targets: WeakMap<object, object>;
	readonly values: WeakMap<object, object>;
	readonly callbacks: WeakMap<Function, Function>;
	readonly functions: WeakMap<Function, Function>;
	readonly bridge: PageApiSandboxBridge;
	active: boolean;
};

function wrapPageApiValue(value: unknown, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext): unknown {
	assertPageApiProxyActive(context);
	if (typeof value === 'function') {
		let wrappedFunction = context.functions.get(value);
		if (!wrappedFunction) {
			wrappedFunction = context.bridge.createFunction((...args: unknown[]) => {
				assertPageApiProxyActive(context);
				const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, prefix, context, false));
				return wrapPageApiValue(Reflect.apply(value, undefined, preparedArgs), methodCalls, prefix, context);
			});
			context.functions.set(value, wrappedFunction);
		}
		return wrappedFunction;
	}
	if (value === null || typeof value !== 'object') {
		return value;
	}
	if (typeof (value as PromiseLike<unknown>).then === 'function') {
		return Promise.resolve(value).then(result => wrapPageApiValue(result, methodCalls, prefix, context));
	}
	const existingProxy = context.proxies.get(value);
	if (existingProxy) {
		return existingProxy;
	}
	const existingValue = context.values.get(value);
	if (existingValue) {
		return existingValue;
	}
	if (Array.isArray(value)) {
		const result = context.bridge.createArray();
		context.values.set(value, result);
		result.push(...value.map(item => wrapPageApiValue(item, methodCalls, prefix, context)));
		return result;
	}
	const prototype = Object.getPrototypeOf(value);
	if (isPlainPageApiObject(prototype)) {
		const result = context.bridge.createObject();
		context.values.set(value, result);
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
			if (descriptor?.enumerable) {
				const propertyValue = Reflect.get(value, key);
				if (typeof propertyValue === 'function') {
					result[key] = context.bridge.createFunction((...args: unknown[]) => {
						assertPageApiProxyActive(context);
						const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, prefix, context, false));
						return wrapPageApiValue(Reflect.apply(propertyValue, value, preparedArgs), methodCalls, prefix, context);
					});
				} else {
					result[key] = wrapPageApiValue(propertyValue, methodCalls, prefix, context);
				}
			}
		}
		return result;
	}
	return createPageApiProxyInternal(value, methodCalls, prefix, context);
}

function preparePageApiArgument(value: unknown, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext, wrapCallbacks: boolean): unknown {
	if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
		return value;
	}
	if (typeof value === 'object') {
		const target = context.targets.get(value);
		if (target) {
			return target;
		}
	}
	if (wrapCallbacks && typeof value === 'function') {
		let callback = context.callbacks.get(value);
		if (!callback) {
			callback = function (this: unknown, ...args: unknown[]) {
				if (!context.active) {
					const route = args[0];
					if (route && typeof route === 'object') {
						const fallback = Reflect.get(route, 'fallback');
						if (typeof fallback === 'function') {
							return Reflect.apply(fallback, route, []);
						}
						const connectToServer = Reflect.get(route, 'connectToServer');
						if (typeof connectToServer === 'function') {
							return Reflect.apply(connectToServer, route, []);
						}
					}
					return undefined;
				}
				const callbackThis = wrapPageApiValue(this, methodCalls, prefix, context);
				return Reflect.apply(value, callbackThis, args.map(arg => wrapPageApiValue(arg, methodCalls, prefix, context)));
			};
			context.callbacks.set(value, callback);
		}
		return callback;
	}
	if (typeof value === 'object') {
		if (Array.isArray(value)) {
			return value.map(item => preparePageApiArgument(item, methodCalls, prefix, context, wrapCallbacks));
		}
		const prototype = Object.getPrototypeOf(value);
		if (isPlainPageApiObject(prototype)) {
			const result: Record<PropertyKey, unknown> = Object.create(null);
			for (const key of Reflect.ownKeys(value)) {
				result[key] = preparePageApiArgument(Reflect.get(value, key), methodCalls, prefix, context, wrapCallbacks);
			}
			return result;
		}
	}
	return value;
}

/**
 * Wrap a Playwright page in a revocable membrane that blocks access to host-realm objects and unrestricted request APIs.
 */
export function createPageApiProxy<T extends object>(target: T, methodCalls: Map<string, number>, bridge: PageApiSandboxBridge): { readonly proxy: T; revoke(): void } {
	const context: PageApiProxyContext = {
		proxies: new WeakMap(),
		targets: new WeakMap(),
		values: new WeakMap(),
		callbacks: new WeakMap(),
		functions: new WeakMap(),
		bridge,
		active: true,
	};
	return {
		proxy: createPageApiProxyInternal(target, methodCalls, '', context),
		revoke: () => context.active = false,
	};
}

function createPageApiProxyInternal<T extends object>(target: T, methodCalls: Map<string, number>, prefix: string, context: PageApiProxyContext): T {
	const existing = context.proxies.get(target);
	if (existing) {
		return existing as T;
	}
	const cache = new Map<PropertyKey, unknown>();
	const facade = Object.create(null);
	const proxy = new Proxy(facade, {
		get(_facade, prop) {
			assertPageApiProxyActive(context);
			if (prop === 'constructor') {
				return undefined;
			}
			if (typeof prop === 'string' && prop.startsWith('_')) {
				context.bridge.throwError('Private Playwright APIs are unavailable.');
			}
			if (prop === 'browser' || prop === 'newCDPSession') {
				context.bridge.throwError(`Playwright API '${prop}' is unavailable in page-scoped automation.`);
			}
			let value: unknown;
			try {
				value = Reflect.get(target, prop, target);
			} catch (error) {
				context.bridge.throwError(error instanceof Error ? error.message : String(error));
			}
			if (prop === 'request' && value !== null && typeof value === 'object') {
				context.bridge.throwError('Playwright API request contexts are blocked by network domain policy.');
			}
			const cached = cache.get(prop);
			if (cached !== undefined) {
				return cached;
			}
			if (typeof value === 'function') {
				const name = prefix + String(prop);
				const wrapper = context.bridge.createFunction((...args: unknown[]) => {
					assertPageApiProxyActive(context);
					methodCalls.set(name, (methodCalls.get(name) ?? 0) + 1);
					const wrapCallbacks = typeof prop !== 'string' || !PAGE_PROXY_SERIALIZED_CALLBACK_METHODS.has(prop);
					const preparedArgs = args.map(arg => preparePageApiArgument(arg, methodCalls, `${name}.`, context, wrapCallbacks));
					const result = Reflect.apply(value as Function, target, preparedArgs);
					return wrapPageApiValue(result, methodCalls, `${name}.`, context);
				});
				cache.set(prop, wrapper);
				return wrapper;
			}
			if (value !== null && typeof value === 'object') {
				const nested = wrapPageApiValue(value, methodCalls, `${prefix}${String(prop)}.`, context);
				cache.set(prop, nested);
				return nested;
			}
			return value;
		},
	});
	context.proxies.set(target, proxy);
	context.targets.set(proxy, target);
	return proxy;
}

function assertPageApiProxyActive(context: PageApiProxyContext): void {
	if (!context.active) {
		context.bridge.throwError('The Playwright page API is no longer available after the action completed.');
	}
}

function isPlainPageApiObject(prototype: object | null): boolean {
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
