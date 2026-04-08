/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Native Node addon that registers a macOS Services provider for "Open with {app}".
 *
 * When the user right-clicks a file/folder in Finder and selects the service,
 * macOS delivers the selected paths to this provider via NSPasteboard. The
 * provider then invokes a JavaScript callback with an array of file paths,
 * which the Electron main process uses to open windows.
 *
 * The service is declared in the app bundle's Info.plist (NSServices key)
 * and is automatically available whenever VS Code is installed — no separate
 * install/uninstall step is required.
 *
 * ## Architecture
 *
 * The service provider registers itself with NSApp on module load.
 * JS code then calls:
 *   - `onOpenFiles(callback)` to receive file paths when the service is invoked
 *   - `setEnabled(bool)` to enable/disable the menu item via validateMenuItem:
 */

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#include <napi.h>
#include <atomic>

// ---------------------------------------------------------------------------
// VSCodeFinderServiceProvider — handles the macOS Services callback
// ---------------------------------------------------------------------------

static std::atomic<bool> sEnabled{false};
static Napi::ThreadSafeFunction sTsfn;

@interface VSCodeFinderServiceProvider : NSObject
- (void)openFiles:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error;
@end

@implementation VSCodeFinderServiceProvider

/**
 * Called by macOS when the user selects our service from Finder's
 * context menu (Services / Quick Actions).
 */
- (void)openFiles:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error {
	if (!sEnabled.load()) {
		return;
	}

	// Read file URLs from the pasteboard
	NSArray<NSURL *> *urls = [pboard readObjectsForClasses:@[[NSURL class]]
		options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}];
	if (!urls || urls.count == 0) {
		return;
	}

	// Collect the POSIX paths
	NSMutableArray<NSString *> *paths = [NSMutableArray arrayWithCapacity:urls.count];
	for (NSURL *url in urls) {
		if (url.isFileURL && url.path) {
			[paths addObject:url.path];
		}
	}

	if (paths.count == 0) {
		return;
	}

	// Forward paths to JavaScript via the thread-safe function
	NSArray<NSString *> *capturedPaths = [paths copy];
	sTsfn.BlockingCall([capturedPaths](Napi::Env env, Napi::Function jsCallback) {
		Napi::Array arr = Napi::Array::New(env, capturedPaths.count);
		for (NSUInteger i = 0; i < capturedPaths.count; i++) {
			arr.Set(i, Napi::String::New(env, [capturedPaths[i] UTF8String]));
		}
		jsCallback.Call({arr});
	});
}

/**
 * Menu validation — returns the current enabled state controlled from JS
 * via setEnabled(). Disabled by default until JS explicitly enables.
 */
- (BOOL)validateMenuItem:(NSMenuItem *)menuItem {
	return sEnabled.load() ? YES : NO;
}

@end

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

/**
 * onOpenFiles(callback: (paths: string[]) => void): void
 *
 * Registers the JS callback that receives file paths when the macOS
 * service is invoked from Finder. Only the last registered callback
 * is active.
 */
static Napi::Value OnOpenFiles(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsFunction()) {
		Napi::TypeError::New(env, "Expected a callback function")
			.ThrowAsJavaScriptException();
		return env.Undefined();
	}

	// Release previous TSFN if any
	if (sTsfn) {
		sTsfn.Release();
	}

	sTsfn = Napi::ThreadSafeFunction::New(
		env,
		info[0].As<Napi::Function>(),
		"VSCodeFinderServiceCallback",
		0,  // unlimited queue
		1   // initial thread count
	);

	return env.Undefined();
}

/**
 * setEnabled(enabled: boolean): void
 *
 * Enables or disables the Finder service menu item. When disabled,
 * validateMenuItem: returns NO and openFiles: is a no-op.
 */
static Napi::Value SetEnabled(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsBoolean()) {
		Napi::TypeError::New(env, "Expected a boolean argument")
			.ThrowAsJavaScriptException();
		return env.Undefined();
	}

	sEnabled.store(info[0].As<Napi::Boolean>().Value());
	return env.Undefined();
}

/**
 * Module initialization — registers the service provider with NSApp
 * automatically when the module is loaded. This ensures the provider
 * is in place as early as possible.
 */
static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
	// Self-register as NSApp services provider on module load
	static VSCodeFinderServiceProvider *sProvider = [[VSCodeFinderServiceProvider alloc] init];
	[NSApp setServicesProvider:sProvider];

	exports.Set("onOpenFiles", Napi::Function::New(env, OnOpenFiles));
	exports.Set("setEnabled", Napi::Function::New(env, SetEnabled));
	return exports;
}

NODE_API_MODULE(vscode_finder_service, InitModule)
