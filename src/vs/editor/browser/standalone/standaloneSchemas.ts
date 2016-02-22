/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import {IJSONSchema} from 'vs/base/common/jsonSchema';

this.MonacoEditorSchemas = this.MonacoEditorSchemas || {};
let MonacoEditorSchemas: { [uri:string]:IJSONSchema } = this.MonacoEditorSchemas;

MonacoEditorSchemas['http://json.schemastore.org/project'] = {
	'title': nls.localize('project.json.title', 'JSON schema for ASP.NET project.json files'),
	'$schema': 'http://json-schema.org/draft-04/schema#',
	'id': 'http://json.schemastore.org/project',
	'type': 'object',

	'definitions': {
		'compilationOptions': {
			'description': nls.localize('project.json.compilationOptions', 'Compilation options that are passed through to Roslyn'),
			'type': 'object',
			'properties': {
				'define': {
					'type': 'array',
					'items': {
						'type': 'string',
						'uniqueItems': true
					}
				},
				'warningsAsErrors': {
					'type': 'boolean',
					'default': false
				},
				'allowUnsafe': {
					'type': 'boolean',
					'default': false
				},
				'optimize': {
					'type': 'boolean',
					'default': false
				},
				'languageVersion': {
					'type': 'string',
					'enum': ['csharp1', 'csharp2', 'csharp3', 'csharp4', 'csharp5', 'csharp6', 'experimental']
				}
			}
		},
		'configType': {
			'type': 'object',
			'properties': {
				'dependencies': { '$ref': '#/definitions/dependencies' },
				'compilationOptions': { '$ref': '#/definitions/compilationOptions' },
				'frameworkAssemblies': { '$ref': '#/definitions/dependencies' }
			}
		},
		'dependencies': {
			'type': 'object',
			'additionalProperties': {
				'type': ['string', 'object'],
				'properties': {
					'version': {
						'type': 'string',
						'description': nls.localize('project.json.dependency.name', 'The version of the dependency.')
					},
					'type': {
						'type': 'string',
						'default': 'default',
						'enum': ['default', 'build'],
						'description': nls.localize('project.json.dependency.type', 'The type of the dependency. \'build\' dependencies only exist at build time')
					}
				},
				'id': 'nugget-package'

			},
			'description': nls.localize('project.json.dependencies', 'The dependencies of the application. Each entry specifes the name and the version of a Nuget package.'),
			'id': 'nugget-packages'
		},
		'script': {
			'type': ['string', 'array'],
			'items': {
				'type': 'string'
			},
			'description': nls.localize('project.json.script', 'A command line script or scripts.\r\rAvailable variables:\r%project:Directory% - The project directory\r%project:Name% - The project name\r%project:Version% - The project version')
		}
	},

	'properties': {
		'authors': {
			'description': nls.localize('project.json.authors', 'The author of the application'),
			'type': 'array',
			'items': {
				'type': 'string',
				'uniqueItems': true
			}
		},
		'bundleExclude': {
			'description':  nls.localize('project.json.bundleExclude', 'List of files to exclude from publish output (kpm bundle).'),
			'type': [ 'string', 'array' ],
			'items': {
				'type': 'string'
			},
			'default': ''
		},
		'code': {
			'description': nls.localize('project.json.code', 'Glob pattern to specify all the code files that needs to be compiled. (data type: string or array with glob pattern(s)). Example: [ \'Folder1\\*.cs\', \'Folder2\\*.cs\' ]'),
			'type': ['string', 'array'],
			'items': {
				'type': 'string'
			},
			'default': '**\\*.cs'
		},
		'commands': {
			'description': nls.localize('project.json.commands', 'Commands that are available for this application'),
			'type': 'object',
			'additionalProperties': {
				'type': 'string'
			}
		},
		'compilationOptions': { '$ref': '#/definitions/compilationOptions' },
		'configurations': {
			'type': 'object',
			'description': nls.localize('project.json.configurations', 'Configurations are named groups of compilation settings. There are 2 defaults built into the runtime namely \'Debug\' and \'Release\'.'),
			'additionalProperties': {
				'type': 'object',
				'properties': {
					'compilationOptions': { '$ref': '#/definitions/compilationOptions' }
				}
			}
		},
		'dependencies': { '$ref': '#/definitions/dependencies' },
		'description': {
			'description': nls.localize('project.json.description', 'The description of the application'),
			'type': 'string'
		},
		'exclude': {
			'description': nls.localize('project.json.exclude', 'Glob pattern to indicate all the code files to be excluded from compilation. (data type: string or array with glob pattern(s)).'),
			'type': ['string', 'array'],
			'items': {
				'type': 'string'
			},
			'default': ['bin/**/*.*', 'obj/**/*.*']
		},
		'frameworks': {
			'description': nls.localize('project.json.frameworks', 'Target frameworks that will be built, and dependencies that are specific to the configuration.'),
			'type': 'object',
			'additionalProperties': { '$ref': '#/definitions/configType' }
		},
		'preprocess': {
			'description': nls.localize('project.json.preprocess', 'Glob pattern to indicate all the code files to be preprocessed. (data type: string with glob pattern).'),
			'type': 'string',
			'default': 'Compiler\\Preprocess\\**\\*.cs'
		},
		'resources': {
			'description': nls.localize('project.json.resources', 'Glob pattern to indicate all the files that need to be compiled as resources.'),
			'type': ['string', 'array'],
			'items': {
				'type': 'string'
			},
			'default': 'Compiler\\Resources\\**\\*.cs'
		},
		'scripts': {
			'type': 'object',
			'description': nls.localize('project.json.scripts', 'Scripts to execute during the various stages.'),
			'properties': {
				'prepack': { '$ref': '#/definitions/script' },
				'postpack': { '$ref': '#/definitions/script' },

				'prebundle': { '$ref': '#/definitions/script' },
				'postbundle': { '$ref': '#/definitions/script' },

				'prerestore': { '$ref': '#/definitions/script' },
				'postrestore': { '$ref': '#/definitions/script' },
				'prepare': { '$ref': '#/definitions/script' }
			}
		},
		'shared': {
			'description': nls.localize('project.json.shared', 'Glob pattern to specify the code files to share with dependent projects. Example: [ \'Folder1\\*.cs\', \'Folder2\\*.cs\' ]'),
			'type': ['string', 'array'],
			'items': {
				'type': 'string'
			},
			'default': 'Compiler\\Shared\\**\\*.cs'
		},
		'version': {
			'description': nls.localize('project.json.version', 'The version of the application. Example: 1.2.0.0'),
			'type': 'string'
		},
		'webroot': {
			'description': nls.localize('project.json.webroot', 'Specifying the webroot property in the project.json file specifies the web server root (aka public folder). In visual studio, this folder will be used to root IIS. Static files should be put in here.'),
			'type': 'string'
		}
	}

};
MonacoEditorSchemas['http://json.schemastore.org/bower'] = {

	'title': nls.localize('bower.json.title', 'JSON schema for Bower configuration files'),
	'$schema': 'http://json-schema.org/draft-04/schema#',
	'id': 'http://json.schemastore.org/bower',

	'type': 'object',
	'required': ['name'],

	'patternProperties': {
		'^_': {
			'description': nls.localize('bower.json.invalidPatternName', 'Any property starting with _ is valid.'),
			'additionalProperties': true,
			'additionalItems': true
		}
	},

	'properties': {
		'name': {
			'description': nls.localize('bower.json.packagename', 'The name of your package.'),
			'type': 'string',
			'maxLength': 50
		},
		'description': {
			'description': nls.localize('bower.json.description', 'Help users identify and search for your package with a brief description.'),
			'type': 'string'
		},
		'version': {
			'description': nls.localize('bower.json.version', 'A semantic version number.'),
			'type': 'string'
		},
		'main': {
			'description': nls.localize('bower.json.main', 'The primary acting files necessary to use your package.'),
			'type': ['string', 'array']
		},
		'license': {
			'description': nls.localize('bower.json.license', 'SPDX license identifier or path/url to a license.'),
			'type': ['string', 'array'],
			'maxLength': 140
		},
		'ignore': {
			'description': nls.localize('bower.json.ignore', 'A list of files for Bower to ignore when installing your package.'),
			'type': ['string', 'array']
		},
		'keywords': {
			'description': nls.localize('bower.json.keywords', 'Used for search by keyword. Helps make your package easier to discover without people needing to know its name.'),
			'type': 'array',
			'items': {
				'type': 'string',
				'maxLength': 50
			}
		},
		'authors': {
			'description': nls.localize('bower.json.authors', 'A list of people that authored the contents of the package.'),
			'type': 'array',
			'items': {
				'type': ['string', 'object']
			}
		},
		'homepage': {
			'description': nls.localize('bower.json.homepage', 'URL to learn more about the package. Falls back to GitHub project if not specified and it\'s a GitHub endpoint.'),
			'type': 'string'
		},
		'repository': {
			'description': nls.localize('bower.json.repository', 'The repository in which the source code can be found.'),
			'type': 'object',
			'properties': {
				'type': {
					'type': 'string',
					'enum': ['git']
				},
				'url': {
					'type': 'string'
				}
			}
		},
		'dependencies': {
			'id': 'bower-packages',
			'description': nls.localize('bower.json.dependencies', 'Dependencies are specified with a simple hash of package name to a semver compatible identifier or URL.'),
			'type': 'object',
			'additionalProperties': {
				'id': 'bower-package',
				'type': 'string'
			}
		},
		'devDependencies': {
			'id': 'bower-packages',
			'description': nls.localize('bower.json.devDependencies', 'Dependencies that are only needed for development of the package, e.g., test framework or building documentation.'),
			'type': 'object',
			'additionalProperties': {
				'id': 'bower-package',
				'type': 'string'
			}
		},
		'resolutions': {
			'description': nls.localize('bower.json.resolutions', 'Dependency versions to automatically resolve with if conflicts occur between packages.'),
			'type': 'object'
		},
		'private': {
			'description': nls.localize('bower.json.private', 'If you set it to  true  it will refuse to publish it. This is a way to prevent accidental publication of private repositories.'),
			'type': 'boolean'
		},
		'exportsOverride': {
			'description': nls.localize('bower.json.exportsOverride', 'Used by grunt-bower-task to specify custom install locations.'),
			'type': 'object',
			'additionalProperties': {
				'type': 'object',
				'additionalProperties': {
					'type': 'string'
				}
			}
		},
		'moduleType': {
			'description': nls.localize('bower.json.moduleType', 'The types of modules this package exposes'),
			'type': 'array',
			'items': {
				'enum': ['amd', 'es6', 'globals', 'node', 'yui']
			}
		}
	}
};
MonacoEditorSchemas['http://json.schemastore.org/package'] = {
	'id': 'http://json.schemastore.org/package',
	'description': nls.localize('package.json.description', 'NPM configuration for this package.'),
	'type': 'object',
	'required': ['name', 'version'],
	'definitions': {
		'person': {
			'description': nls.localize('package.json.person', 'A person who has been involved in creating or maintaining this package'),
			'type': [ 'object', 'string' ],
			'required': [ 'name' ],
			'properties': {
				'name': {
					'type': 'string'
				},
				'url': {
					'type': 'string',
					'format': 'uri'
				},
				'email': {
					'type': 'string',
					'format': 'email'
				}
			}
		},
		'dependency': {
			'id': 'npm-packages',
			'description': nls.localize('package.json.dependency', 'Dependencies are specified with a simple hash of package name to version range. The version range is a string which has one or more space-separated descriptors. Dependencies can also be identified with a tarball or git URL.'),
			'type': 'object',
			'additionalProperties': {
				'type': 'string'
			}
		}
	},

	'patternProperties': {
		'^_': {
			'description': nls.localize('package.json.underscore', 'Any property starting with _ is valid.'),
			'additionalProperties': true,
			'additionalItems': true
		}
	},

	'properties': {
		'name': {
			'description': nls.localize('package.json.name', 'The name of the package.'),
			'type': 'string'
		},
		'version': {
			'description': nls.localize('package.json.version', 'Version must be parseable by node-semver, which is bundled with npm as a dependency.'),
			'type': 'string'
		},
		'description': {
			'description': nls.localize('package.json.descr', 'This helps people discover your package, as it\'s listed in \'npm search\'.'),
			'type': 'string'
		},
		'icon': {
			'description': nls.localize('package.json.icon', 'The relative path to the icon of the package.'),
			'type': 'string'
		},
		'keywords': {
			'description': nls.localize('package.json.keywords', 'This helps people discover your package as it\'s listed in \'npm search\'.'),
			'type': 'array'
		},
		'homepage': {
			'description': nls.localize('package.json.homepage', 'The url to the project homepage.'),
			'type': 'string'
		},
		'bugs': {
			'description': nls.localize('package.json.bugs', 'The url to your project\'s issue tracker and / or the email address to which issues should be reported. These are helpful for people who encounter issues with your package.'),
			'type': [ 'object', 'string' ],
			'properties': {
				'url': {
					'type': 'string',
					'description': nls.localize('package.json.bugs.url', 'The url to your project\'s issue tracker.'),
					'format': 'uri'
				},
				'email': {
					'type': 'string',
					'description': nls.localize('package.json.bugs.email', 'The email address to which issues should be reported.')
				}
			}
		},
		'license': {
			'type': 'string',
			'description': nls.localize('package.json.license', 'You should specify a license for your package so that people know how they are permitted to use it, and any restrictions you\'re placing on it.')
		},
		'licenses': {
			'description': nls.localize('package.json.licenses', 'You should specify a license for your package so that people know how they are permitted to use it, and any restrictions you\'re placing on it.'),
			'type': 'array',
			'items': {
				'type': 'object',
				'properties': {
					'type': {
						'type': 'string'
					},
					'url': {
						'type': 'string',
						'format': 'uri'
					}
				}
			}
		},
		'author': {
			'$ref': '#/definitions/person'
		},
		'contributors': {
			'description': nls.localize('package.json.contributors', 'A list of people who contributed to this package.'),
			'type': 'array',
			'items': {
				'$ref': '#/definitions/person'
			}
		},
		'maintainers': {
			'description': nls.localize('package.json.maintainers', 'A list of people who maintains this package.'),
			'type': 'array',
			'items': {
				'$ref': '#/definitions/person'
			}
		},
		'files': {
			'description': nls.localize('package.json.files', 'The \'files\' field is an array of files to include in your project. If you name a folder in the array, then it will also include the files inside that folder.'),
			'type': 'array',
			'items': {
				'type': 'string'
			}
		},
		'main': {
			'description': nls.localize('package.json.main', 'The main field is a module ID that is the primary entry point to your program.'),
			'type': 'string'
		},
		'bin': {
			'type': [ 'string', 'object' ],
			'additionalProperties': {
				'type': 'string'
			}
		},
		'man': {
			'type': [ 'array', 'string' ],
			'description': nls.localize('package.json.man', 'Specify either a single file or an array of filenames to put in place for the man program to find.'),
			'items': {
				'type': 'string'
			}
		},
		'directories': {
			'type': 'object',
			'properties': {
				'bin': {
					'description': nls.localize('package.json.directories.bin', 'If you specify a \'bin\' directory, then all the files in that folder will be used as the \'bin\' hash.'),
					'type': 'string'
				},
				'doc': {
					'description': nls.localize('package.json.directories.doc', 'Put markdown files in here. Eventually, these will be displayed nicely, maybe, someday.'),
					'type': 'string'
				},
				'example': {
					'description': nls.localize('package.json.directories.example', 'Put example scripts in here. Someday, it might be exposed in some clever way.'),
					'type': 'string'
				},
				'lib': {
					'description': nls.localize('package.json.directories.lib', 'Tell people where the bulk of your library is. Nothing special is done with the lib folder in any way, but it\'s useful meta info.'),
					'type': 'string'
				},
				'man': {
					'description': nls.localize('package.json.directories.man', 'A folder that is full of man pages. Sugar to generate a \'man\' array by walking the folder.'),
					'type': 'string'
				},
				'test': {
					'type': 'string'
				}
			}
		},
		'repository': {
			'description': nls.localize('package.json.repository', 'Specify the place where your code lives. This is helpful for people who want to contribute.'),
			'type': 'object',
			'properties': {
				'type': {
					'type': 'string'
				},
				'url': {
					'type': 'string'
				}
			}
		},
		'scripts': {
			'description': nls.localize('package.json.scripts', 'The \'scripts\' member is an object hash of script commands that are run at various times in the lifecycle of your package. The key is the lifecycle event, and the value is the command to run at that point.'),
			'type': 'object',
			'additionalProperties': {
				'type': 'string'
			}
		},
		'config': {
			'description': nls.localize('package.json.config', 'A \'config\' hash can be used to set configuration parameters used in package scripts that persist across upgrades.'),
			'type': 'object',
			'additionalProperties': true
		},
		'dependencies': {
			'$ref': '#/definitions/dependency'
		},
		'devDependencies': {
			'$ref': '#/definitions/dependency'
		},
		'bundleDependencies': {
			'type': 'array',
			'description': nls.localize('package.json.bundleDependencies', 'Array of package names that will be bundled when publishing the package.'),
			'items': {
				'type': 'string'
			}
		},
		'bundledDependencies': {
			'type': 'array',
			'description': nls.localize('package.json.bundledDependencies', 'Array of package names that will be bundled when publishing the package.'),
			'items': {
				'type': 'string'
			}
		},
		'optionalDependencies': {
			'$ref': '#/definitions/dependency'
		},
		'peerDependencies': {
			'$ref': '#/definitions/dependency'
		},
		'engines': {
			'type': 'object',
			'additionalProperties': {
				'type': 'string'
			}
		},
		'engineStrict': {
			'type': 'boolean'
		},
		'os': {
			'type': 'array',
			'items': {
				'type': 'string'
			}
		},
		'cpu': {
			'type': 'array',
			'items': {
				'type': 'string'
			}
		},
		'preferGlobal': {
			'type': 'boolean',
			'description': nls.localize('package.json.preferGlobal', 'If your package is primarily a command-line application that should be installed globally, then set this value to true to provide a warning if it is installed locally.')
		},
		'private': {
			'type': 'boolean',
			'description': nls.localize('package.json.private', 'If set to true, then npm will refuse to publish it.')
		},
		'publishConfig': {
			'type': 'object',
			'additionalProperties': true
		},
		'dist': {
			'type': 'object',
			'properties': {
				'shasum': {
					'type': 'string'
				},
				'tarball': {
					'type': 'string'
				}
			}
		},
		'readme': {
			'type': 'string'
		}
	}
};
MonacoEditorSchemas['http://json.schemastore.org/global'] = {
	'title': nls.localize('global.json.title', 'JSON schema for the ASP.NET global configuration files'),
	'type': 'object',
	'additionalProperties': true,
	'required': [ 'projects' ],

	'properties': {
		'projects': {
			'type': 'array',
			'description': nls.localize('global.json.projects', 'A list of project folders relative to this file.'),
			'items': {
				'type': 'string'
			}
		},
		'sources': {
			'type': 'array',
			'description': nls.localize('global.json.sources', 'A list of source folders relative to this file.'),
			'items': {
				'type': 'string'
			}
		},
		'sdk': {
			'type': 'object',
			'description': nls.localize('global.json.sdk', 'The runtime to use.'),
			'properties': {
				'version': {
					'type': 'string',
					'description': nls.localize('global.json.sdk.version', 'The runtime version to use.')
				},
				'runtime': {
					'type': 'string',
					'description': nls.localize('global.json.sdk.runtime', 'The runtime to use, e.g. coreclr'),
				},
				'architecture': {
					'type': 'string',
					'description': nls.localize('global.json.sdk.architecture', 'The runtime architecture to use, e.g. x64.')
				}
			}
		}
	}
};
MonacoEditorSchemas['http://json.schemastore.org/tsconfig'] = {
	'title': nls.localize('tsconfig.json.title', "JSON schema for the TypeScript compiler's configuration file"),
	'$schema': 'http://json-schema.org/draft-04/schema#',

	'type': 'object',
	'default': { 'compilerOptions': { 'target': 'ES5', 'module': 'commonjs'} },
	'properties': {
		'compilerOptions': {
			'type': 'object',
			'description': nls.localize('tsconfig.json.compilerOptions', 'Instructs the TypeScript compiler how to compile .ts files'),
			'properties': {
				'charset': {
					'description': nls.localize('tsconfig.json.compilerOptions.charset', 'The character set of the input files'),
					'type': 'string'
				},
				'declaration': {
					'description': nls.localize('tsconfig.json.compilerOptions.declaration', 'Generates corresponding d.ts files.'),
					'type': 'boolean'
				},
				'diagnostics': {
					'description': nls.localize('tsconfig.json.compilerOptions.diagnostics', 'Show diagnostic information.'),
					'type': 'boolean'
				},
				'emitBOM': {
					'description': nls.localize('tsconfig.json.compilerOptions.emitBOM', 'Emit a UTF-8 Byte Order Mark (BOM) in the beginning of output files.'),
					'type': 'boolean'
				},
				'inlineSourceMap': {
					'description': nls.localize('tsconfig.json.compilerOptions.inlineSourceMap', 'Emit a single file with source maps instead of having a separate file.'),
					'type': 'boolean'
				},
				'inlineSources': {
					'description': nls.localize('tsconfig.json.compilerOptions.inlineSources', 'Emit the source alongside the sourcemaps within a single file; requires --inlineSourceMap to be set.'),
					'type': 'boolean'
				},
				'listFiles': {
					'description': nls.localize('tsconfig.json.compilerOptions.listFiles', 'Print names of files part of the compilation.'),
					'type': 'boolean'
				},
				'locale': {
					'description': nls.localize('tsconfig.json.compilerOptions.locale', 'The locale to use to show error messages, e.g. en-us.'),
					'type': 'string'
				},
				'mapRoot': {
					'description': nls.localize('tsconfig.json.compilerOptions.mapRoot', 'Specifies the location where debugger should locate map files instead of generated locations'),
					'type': 'string',
					'format': 'uri'
				},
				'module': {
					'description': nls.localize('tsconfig.json.compilerOptions.module', "Specify module code generation: 'CommonJS', 'Amd', 'System', or 'UMD'."),
					'enum': ['commonjs', 'amd', 'umd', 'system']
				},
				'newLine': {
					'description': nls.localize('tsconfig.json.compilerOptions.newLine', "Specifies the end of line sequence to be used when emitting files: 'CRLF' (dos) or 'LF' (unix).)"),
					'enum': [ 'CRLF', 'LF' ]
				},
				'noEmit': {
					'description': nls.localize('tsconfig.json.compilerOptions.noEmit', 'Do not emit output.'),
					'type': 'boolean'
				},
				'noEmitOnError': {
					'description': nls.localize('tsconfig.json.compilerOptions.noEmitOnError', 'Do not emit outputs if any type checking errors were reported.'),
					'type': 'boolean'
				},
				'noEmitHelpers': {
					'description': nls.localize('tsconfig.json.compilerOptions.noEmitHelpers', 'Do not generate custom helper functions like __extends in compiled output.'),
					'type': 'boolean'
				},
				'noImplicitAny': {
					'description': nls.localize('tsconfig.json.compilerOptions.noImplicitAny', "Warn on expressions and declarations with an implied 'any' type."),
					'type': 'boolean'
				},
				'noLib': {
					'description': nls.localize('tsconfig.json.compilerOptions.noLib', "Do not include the default library file (lib.d.ts)."),
					'type': 'boolean'
				},
				'noResolve': {
					'description': nls.localize('tsconfig.json.compilerOptions.noResolve', "Do not add triple-slash references or module import targets to the list of compiled files."),
					'type': 'boolean'
				},
				'out': {
					'description': nls.localize('tsconfig.json.compilerOptions.out', 'Concatenate and emit output to single file.'),
					'type': 'string',
					'format': 'uri'
				},
				'outDir': {
					'description': nls.localize('tsconfig.json.compilerOptions.outDir', 'Redirect output structure to the directory.'),
					'type': 'string',
					'format': 'uri'
				},
				'preserveConstEnums': {
					'description': nls.localize('tsconfig.json.compilerOptions.preserveConstEnums', 'Do not erase const enum declarations in generated code.'),
					'type': 'boolean'
				},
				'removeComments': {
					'description': nls.localize('tsconfig.json.compilerOptions.removeComments', 'Do not emit comments to output.'),
					'type': 'boolean'
				},
				'rootDir': {
					'description': nls.localize('tsconfig.json.compilerOptions.rootDir', 'Specifies the root directory of input files. Use to control the output directory structure with --outDir.'),
					'type': 'string'
				},
				'sourceMap': {
					'description': nls.localize('tsconfig.json.compilerOptions.sourceMap', "Generates corresponding '.map' file."),
					'type': 'boolean'
				},
				'sourceRoot': {
					'description': nls.localize('tsconfig.json.compilerOptions.sourceRoot', 'Specifies the location where debugger should locate TypeScript files instead of source locations.'),
					'type': 'string',
					'format': 'uri'
				},
				'suppressImplicitAnyIndexErrors': {
					'description': nls.localize('tsconfig.json.compilerOptions.suppressImplicitAnyIndexErrors', 'Suppress noImplicitAny errors for indexing objects lacking index signatures.'),
					'type': 'boolean'
				},
				'target': {
					'description': nls.localize('tsconfig.json.compilerOptions.target', "Specify ECMAScript target version:  'ES3' (default), 'ES5', or 'ES6' (experimental)."),
					'enum': ['ES3', 'ES5', 'ES6', 'es3', 'es5', 'es6'],
					'default': 'ES3'
				},
				'watch': {
					'description': nls.localize('tsconfig.json.compilerOptions.watch', "Watch input files."),
					'type': 'boolean'
				},
				'jsx': {
					'description': nls.localize('tsconfig.json.compilerOptions.jsx', "Enable the JSX option (requires TypeScript 1.6):  'preserve', 'react'."),
					'enum': ['react', 'preserve'],
					'default': 'react'
				},
				'emitDecoratorMetadata': {
					'description': nls.localize('tsconfig.json.compilerOptions.emitDecoratorMetadata', 'Emits meta data.for ES7 decorators.'),
					'type': 'boolean'
				},
				'isolatedModules': {
					'description': nls.localize('tsconfig.json.compilerOptions.isolatedModules', 'Supports transpiling single TS files into JS files.'),
					'type': 'boolean'
				},
				'experimentalDecorators': {
					'description': nls.localize('tsconfig.json.compilerOptions.experimentalDecorators', 'Enables experimental support for ES7 decorators.'),
					'type': 'boolean'
				},
				'experimentalAsyncFunctions': {
					'description': nls.localize('tsconfig.json.compilerOptions.experimentalAsynFunctions', 'Enables experimental support for async functions (requires TypeScript 1.6).'),
					'type': 'boolean'
				}
			}
		},
		'files': {
			'type': 'array',
			'description': nls.localize('tsconfig.json.files', "If no 'files' property is present in a tsconfig.json, the compiler defaults to including all files the containing directory and subdirectories. When a 'files' property is specified, only those files are included."),
			'items': {
				'type': 'string',
				'format': 'uri'
			}
		}
	}
};

MonacoEditorSchemas['http://opentools.azurewebsites.net/jsconfig'] = {
	'title': nls.localize('jsconfig.json.title', "JSON schema for the JavaScript configuration file"),
	'type': 'object',
	'default': { 'compilerOptions': { 'target': 'ES6' } },
	'properties': {
		'compilerOptions': {
			'type': 'object',
			'description': nls.localize('jsconfig.json.compilerOptions', 'Instructs the JavaScript language service how to validate .js files'),
			'properties': {
				'charset': {
					'description': nls.localize('jsconfig.json.compilerOptions.charset', 'The character set of the input files'),
					'type': 'string'
				},
				'diagnostics': {
					'description': nls.localize('jsconfig.json.compilerOptions.diagnostics', 'Show diagnostic information.'),
					'type': 'boolean'
				},
				'locale': {
					'description': nls.localize('jsconfig.json.compilerOptions.locale', 'The locale to use to show error messages, e.g. en-us.'),
					'type': 'string'
				},
				'mapRoot': {
					'description': nls.localize('jsconfig.json.compilerOptions.mapRoot', 'Specifies the location where debugger should locate map files instead of generated locations'),
					'type': 'string',
					'format': 'uri'
				},
				'module': {
					'description': nls.localize('jsconfig.json.compilerOptions.module', "Module code generation to resolve against: 'commonjs', 'amd', 'system', or 'umd'."),
					'enum': ['commonjs', 'amd', 'system', 'umd']
				},
				'noLib': {
					'description': nls.localize('jsconfig.json.compilerOptions.noLib', "Do not include the default library file (lib.d.ts)."),
					'type': 'boolean'
				},
				'target': {
					'description': nls.localize('jsconfig.json.compilerOptions.target', "Specify ECMAScript target version:  'ES3' (default), 'ES5', or 'ES6' (experimental)."),
					'enum': ['ES3', 'ES5', 'ES6', 'es3', 'es5', 'es6'],
					'default': 'ES3'
				},
				'experimentalDecorators': {
					'description': nls.localize('jsconfig.json.compilerOptions.decorators', "Enables experimental support for ES7 decorators."),
					'type': 'boolean'
				}
			}
		},
		'files': {
			'type': 'array',
			'description': nls.localize('jsconfig.json.files', "If no 'files' property is present in a jsconfig.json, the language service defaults to including all files the containing directory and subdirectories. When a 'files' property is specified, only those files are included."),
			'items': {
				'type': 'string',
				'format': 'uri'
			}
		},
		'exclude': {
			'type': 'array',
			'description': nls.localize('jsconfig.json.exclude', "List files and folders that should not be included. This property is not honored when the 'files' property is present."),
			'items': {
				'type': 'string',
				'format': 'uri'
			}
		}
	}
};
