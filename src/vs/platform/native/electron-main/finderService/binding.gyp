# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.
{
	"targets": [{
		"target_name": "vscode_finder_service",
		"conditions": [
			["OS=='mac'", {
				"sources": ["src/finderService.mm"],
				"include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
				"dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
				"cflags!": ["-fno-exceptions"],
				"cflags_cc!": ["-fno-exceptions"],
				"xcode_settings": {
					"GCC_ENABLE_CPP_EXCEPTIONS": "YES",
					"CLANG_ENABLE_OBJC_ARC": "YES",
					"OTHER_LDFLAGS": [
						"-framework AppKit",
						"-framework Foundation"
					]
				},
				"defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
			}]
		]
	}]
}
