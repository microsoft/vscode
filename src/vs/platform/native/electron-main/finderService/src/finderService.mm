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
 * 1. `init(callback)` — called once at app startup.
 *    Creates an Objective-C object, sets it as `NSApp.servicesProvider`,
 *    and stores the JS callback as a thread-safe function.
 *
 * 2. When macOS invokes the service, the Objective-C method
 *    `-openFiles:userData:error:` reads file URLs from the pasteboard
 *    and calls back into JavaScript on the main thread.
 *
 * 3. `-validateMenuItem:` always returns YES so the menu item is enabled
 *    whenever VS Code is running.
 */

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#include <napi.h>

// ---------------------------------------------------------------------------
// VSCodeFinderServiceProvider — handles the macOS Services callback
// ---------------------------------------------------------------------------

@interface VSCodeFinderServiceProvider : NSObject {
	Napi::ThreadSafeFunction _tsfn;
}
- (instancetype)initWithTSFN:(Napi::ThreadSafeFunction)tsfn;
- (void)openFiles:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error;
@end

@implementation VSCodeFinderServiceProvider

- (instancetype)initWithTSFN:(Napi::ThreadSafeFunction)tsfn {
	self = [super init];
	if (self) {
		_tsfn = std::move(tsfn);
	}
	return self;
}

/**
 * Called by macOS when the user selects our service from Finder's
 * context menu (Services / Quick Actions).
 */
- (void)openFiles:(NSPasteboard *)pboard userData:(NSString *)userData error:(NSString **)error {
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
	_tsfn.BlockingCall([capturedPaths](Napi::Env env, Napi::Function jsCallback) {
		Napi::Array arr = Napi::Array::New(env, capturedPaths.count);
		for (NSUInteger i = 0; i < capturedPaths.count; i++) {
			arr.Set(i, Napi::String::New(env, [capturedPaths[i] UTF8String]));
		}
		jsCallback.Call({arr});
	});
}

/**
 * Menu validation — return YES so the service is always available
 * when VS Code is running.
 */
- (BOOL)validateMenuItem:(NSMenuItem *)menuItem {
	return YES;
}

@end

// ---------------------------------------------------------------------------
// N-API exports
// ---------------------------------------------------------------------------

static VSCodeFinderServiceProvider *sProvider = nil;

/**
 * init(callback: (paths: string[]) => void): void
 *
 * Registers the service provider with NSApp. Must be called once
 * from the Electron main process after the app is ready.
 */
static Napi::Value Init(const Napi::CallbackInfo &info) {
	Napi::Env env = info.Env();

	if (info.Length() < 1 || !info[0].IsFunction()) {
		Napi::TypeError::New(env, "Expected a callback function")
			.ThrowAsJavaScriptException();
		return env.Undefined();
	}

	// Create a thread-safe function so the Obj-C callback can safely
	// invoke the JS function from any thread.
	Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
		env,
		info[0].As<Napi::Function>(),
		"VSCodeFinderServiceCallback",
		0,  // unlimited queue
		1   // initial thread count
	);

	sProvider = [[VSCodeFinderServiceProvider alloc] initWithTSFN:std::move(tsfn)];
	[NSApp setServicesProvider:sProvider];

	return env.Undefined();
}

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
	exports.Set("init", Napi::Function::New(env, Init));
	return exports;
}

NODE_API_MODULE(vscode_finder_service, InitModule)
