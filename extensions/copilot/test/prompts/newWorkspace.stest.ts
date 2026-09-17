/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { FileContentsGenerator } from '../../src/extension/intents/node/generateNewWorkspaceContent';
import { NewWorkspaceContentsPromptProps } from '../../src/extension/prompts/node/panel/newWorkspace/newWorkspaceContents';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';

interface IGenerateFileContentsScenario {
	args: {
		PROJECT_DESCRIPTION: string;
		PROJECT_TREE_STRUCTURE: string;
		PROJECT_SPECIFICATION: string;
		FILEPATH: string;
	};
	validate?: (response: string) => void;
}

function generateFileContentsPromptTest(scenario: IGenerateFileContentsScenario, language: string) {
	stest({ description: `File contents generation: ${scenario.args.FILEPATH} in ${scenario.args.PROJECT_DESCRIPTION}`, language }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const fileContentGenerator = accessor.get(IInstantiationService).createInstance(FileContentsGenerator);
		const promptArgs: NewWorkspaceContentsPromptProps = {
			query: scenario.args.PROJECT_DESCRIPTION,
			fileTreeStr: scenario.args.PROJECT_TREE_STRUCTURE,
			projectSpecification: scenario.args.PROJECT_SPECIFICATION,
			filePath: scenario.args.FILEPATH,
			history: [],
		};

		const result = await fileContentGenerator.generate(promptArgs, CancellationToken.None);
		const trimmedResult = result.trim();

		// Generated file contents should never be empty
		assert.ok(trimmedResult.length > 0);

		// Generated file contents should never start with backticks
		assert.ok(!trimmedResult.startsWith('```'));

		// The AI shouldn't refuse to generate file contents
		assert.ok(!trimmedResult.startsWith('Sorry, I cannot generate file contents'));

		// Perform additional scenario-specific validation if provided
		scenario.validate?.(trimmedResult);
	});
}

namespace TypeScript {
	export const PROJECT_DESCRIPTION = 'Create a TypeScript Express app';
	export const PROJECT_TREE_STRUCTURE = `
	my-express-app
	├── src
	│   ├── app.ts
	│   ├── controllers
	│   │   └── index.ts
	│   ├── routes
	│   │   └── index.ts
	│   └── types
	│       └── index.ts
	├── package.json
	├── tsconfig.json
	└── README.md`;
	export const PROJECT_SPECIFICATION = `The project has the following files:
	1. \`src/app.ts\`: This file is the entry point of the application. It creates an instance of the express app and sets up middleware and routes.
	2. \`src/controllers/index.ts\`: This file exports a class \`IndexController\` which has a method \`getIndex\` that handles the root route of the application.
	3. \`src/routes/index.ts\`: This file exports a function \`setRoutes\` which sets up the routes for the application. It uses the \`IndexController\` to handle the root route.
	4. \`src/types/index.ts\`: This file exports interfaces \`Request\` and \`Response\` which extend the interfaces from the \`express\` library.
	5. \`tsconfig.json\`: This file is the configuration file for TypeScript. It specifies the compiler options and the files to include in the compilation.
	6. \`package.json\`: This file is the configuration file for npm. It lists the dependencies and scripts for the project.
	7. \`README.md\`: This file contains the documentation for the project.`;
}

namespace PythonDjango {
	export const PROJECT_DESCRIPTION = 'python Django backend that uses REST API to connect to Azure CosmosDB NoSQL';
	export const PROJECT_TREE_STRUCTURE = `
	my-django-cosmosdb-project
	├── myapp
	│   ├── migrations
	│   ├── __init__.py
	│   ├── admin.py
	│   ├── apps.py
	│   ├── models.py
	│   ├── serializers.py
	│   ├── tests.py
	│   ├── urls.py
	│   └── views.py
	├── myproject
	│   ├── __init__.py
	│   ├── asgi.py
	│   ├── settings.py
	│   ├── urls.py
	│   └── wsgi.py
	├── requirements.txt
	├── Dockerfile
	├── .dockerignore
	├── .gitignore
	├── README.md`;
	export const PROJECT_SPECIFICATION = `The project tree structure consists of the following files and directories:

	- \`myapp/\`: This directory contains the Django app for the project.
	  - \`migrations/\`: This directory contains the database migration files.
	  - \`__init__.py\`: This file is an empty file that tells Python that this directory should be considered as a package.
	  - \`admin.py\`: This file contains the configuration for the Django admin interface.
	  - \`apps.py\`: This file contains the configuration for the app.
	  - \`models.py\`: This file contains the database models for the app.
	  - \`serializers.py\`: This file contains the serializers for the app.
	  - \`tests.py\`: This file contains the tests for the app.
	  - \`urls.py\`: This file contains the URL routing for the app.
	  - \`views.py\`: This file contains the views for the app.
	- \`myproject/\`: This directory contains the Django project settings.
	  - \`__init__.py\`: This file is an empty file that tells Python that this directory should be considered as a package.
	  - \`asgi.py\`: This file contains the ASGI configuration for the project.
	  - \`settings.py\`: This file contains the project settings.
	  - \`urls.py\`: This file contains the URL routing for the project.
	  - \`wsgi.py\`: This file contains the WSGI configuration for the project.
	- \`requirements.txt\`: This file contains the Python dependencies required for the project.
	- \`Dockerfile\`: This file contains the instructions for building a Docker image for the project.
	- \`.dockerignore\`: This file contains the files and directories that should be excluded from the Docker build context.
	- \`.gitignore\`: This file contains the files and directories that should be excluded from version control.
	- \`README.md\`: This file contains the project documentation.`;
}

namespace CPP {
	export const PROJECT_DESCRIPTION = 'A nodejs native node module that has a fib function in C++ exported to TS using NAPI. Include a tsconfig.json. The fib function takes an integer N as its argument.';
	export const PROJECT_TREE_STRUCTURE = `
my-node-module
├── src
│   ├── fibModule.cpp
│   ├── fibModule.h
│   └── index.ts
├── binding.gyp
├── package.json
├── tsconfig.json
└── README.md
`;
	export const PROJECT_SPECIFICATION = `
	The project has the following files:

	\`src/fibModule.cpp\`: This file contains the C++ implementation of the Fibonacci function. It exports a function \`Fib\` that takes an integer N as its argument and returns the Nth Fibonacci number.

	\`src/fibModule.h\`: This file contains the header for the Fibonacci function. It declares the \`Fib\` function.

	\`src/index.ts\`: This file is the entry point of the module. It imports the \`Fib\` function from the C++ module using NAPI and exports it to be used in TypeScript.

	\`binding.gyp\`: This file is used by node-gyp to build the native module. It specifies the source files and the dependencies for the build.

	\`package.json\`: This file is the configuration file for npm. It lists the dependencies and scripts for the project. It also specifies the build command to use node-gyp to build the native module.

	\`tsconfig.json\`: This file is the configuration file for TypeScript. It specifies the compiler options and the files to include in the compilation.

	\`README.md\`: This file contains the documentation for the project. It explains how to use the module and the Fibonacci function.
	Think step by step and give me just the file /my-node-module/src/fibModule.h within this project. The code should not contain bugs.
	If the file is supposed to be empty, please respond with a code comment saying that this file is intentionally left blank.
	Do not include comments in json files.
	Do not use code blocks or backticks.
	Do not include product names such as Visual Studio in the comments.`;
}

ssuite({ title: 'new', subtitle: 'prompt', location: 'panel' }, () => {

	// #region TypeScript

	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: TypeScript.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: TypeScript.PROJECT_TREE_STRUCTURE,
			PROJECT_SPECIFICATION: TypeScript.PROJECT_SPECIFICATION,
			FILEPATH: 'README.md',
		},
		validate: (response: string) => {
			assert.ok(response.startsWith('#'), `Generated README.md does not start with a #`);
		}
	}, 'typescript');

	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: TypeScript.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: TypeScript.PROJECT_TREE_STRUCTURE,
			PROJECT_SPECIFICATION: TypeScript.PROJECT_SPECIFICATION,
			FILEPATH: 'package.json',
		},
		validate: (response: string) => {
			try {
				JSON.parse(response);
			} catch (ex) {
				assert.fail(`Generated package.json is not valid JSON: ${JSON.stringify(ex)}`);
			}
		}
	}, 'typescript');

	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: TypeScript.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: TypeScript.PROJECT_TREE_STRUCTURE,
			PROJECT_SPECIFICATION: TypeScript.PROJECT_SPECIFICATION,
			FILEPATH: 'src/app.ts',
		}
	}, 'typescript');

	// #endregion

	// #region Python
	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: PythonDjango.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: PythonDjango.PROJECT_TREE_STRUCTURE,
			FILEPATH: 'myapp/__init__.py',
			PROJECT_SPECIFICATION: PythonDjango.PROJECT_SPECIFICATION
		},
		validate: (response: string) => {
			assert.ok(response.includes('# This file is intentionally left blank.'), 'Intentionally blank file does not contain the expected comment');
		}
	}, 'python');

	// This test currently always fails because the response hits the content filter
	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: PythonDjango.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: PythonDjango.PROJECT_TREE_STRUCTURE,
			FILEPATH: 'myapp/manage.py',
			PROJECT_SPECIFICATION: PythonDjango.PROJECT_SPECIFICATION
		}
	}, 'python');
	// #endregion

	// #region CPP
	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: CPP.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: CPP.PROJECT_TREE_STRUCTURE,
			FILEPATH: 'src/fibModule.h',
			PROJECT_SPECIFICATION: CPP.PROJECT_SPECIFICATION
		},
		validate: (response: string) => {
			assert.ok(!response.startsWith('++'), 'C++ file was not correctly parsed');
		}
	}, 'cpp');

	generateFileContentsPromptTest({
		args: {
			PROJECT_DESCRIPTION: CPP.PROJECT_DESCRIPTION,
			PROJECT_TREE_STRUCTURE: CPP.PROJECT_TREE_STRUCTURE,
			FILEPATH: 'src/fibModule.cpp',
			PROJECT_SPECIFICATION: CPP.PROJECT_SPECIFICATION
		},
		validate: (response: string) => {
			assert.ok(!response.startsWith('++'), 'C++ file was not correctly parsed');
		}
	}, 'cpp');
	// #endregion
});
