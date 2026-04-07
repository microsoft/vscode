/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { newNotebookCodeCell } from '../../src/extension/intents/node/newNotebookIntent';
import { IChatMLFetcher } from '../../src/platform/chat/common/chatMLFetcher';
import { IEndpointProvider } from '../../src/platform/endpoint/common/endpointProvider';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { INotebookSection } from '../../src/util/common/notebooks';
import { CancellationToken } from '../../src/util/vs/base/common/cancellation';
import { URI } from '../../src/util/vs/base/common/uri';
import { IInstantiationService } from '../../src/util/vs/platform/instantiation/common/instantiation';
import { ssuite, stest } from '../base/stest';
import { fetchConversationOptions } from '../e2e/scenarioTest';
import { isValidPythonFile } from '../simulation/diagnosticProviders/python';

ssuite({ title: 'newNotebook', subtitle: 'prompt', location: 'panel' }, () => {
	stest({ description: 'generate code cell', language: 'python' }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
		const topic = 'Creating Random Arrays with Numpy';
		const sections: INotebookSection[] = [
			{
				'title': 'Import Required Libraries',
				'content': 'Import the necessary libraries, including NumPy.'
			},
			{
				'title': 'Create Random Arrays',
				'content': 'Use NumPy to create random arrays of various shapes and sizes, including 1D, 2D, and 3D arrays.'
			},
			{
				'title': 'Seed the Random Number Generator',
				'content': 'Use the seed() function to seed the random number generator for reproducibility.'
			},
			{
				'title': 'Generate Random Integers',
				'content': 'Use the randint() function to generate random integers within a specified range.'
			}
		];

		const cells: string[] = [];
		const firstCell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[0], '', 'python', URI.file('sample.ipynb'), CancellationToken.None);
		assert.ok(firstCell !== undefined, 'code should not be empty');
		assert.ok(firstCell.includes('import numpy as np'), 'code should include import numpy as np');

		const firstCellIsValid = await validatePythonCode(accessor, firstCell!);
		assert.ok(firstCellIsValid, 'first cell code should be valid python code');
		cells.push(firstCell!);

		const secondCell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[1], cells.join('\n'), 'python', URI.file('sample.ipynb'), CancellationToken.None);
		assert.ok(secondCell !== undefined, 'code should not be empty');
		assert.ok(!secondCell.includes('import numpy'), 'code should not include import numpy again');
		// const secondCellIsValid = await validatePythonCode(accessor, secondCell!);
		// assert.ok(secondCellIsValid, 'second cell code should be valid python code');
	});

	stest({ description: 'Generate code cell (numpy)', language: 'python' }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
		const topic = 'A Jupyter notebook that creates a structured array with NumPy.';
		const sections: INotebookSection[] = [
			{
				title: 'Import Required Libraries', content: 'Import the necessary libraries, including NumPy.'
			},
			{
				title: 'Create Structured Array', content: 'Use NumPy to create a structured array with named fields and data types.'
			},
			{
				title: 'Accessing Structured Array Elements', content: 'Access individual elements of the structured array using the field names.'
			},
			{
				title: 'Iterating over Structured Arrays', content: 'Iterate over the structured array using a fo…nd access the field values for each element.'
			}
		];

		const cells: string[] = [];
		const firstCell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[0], '', 'python', URI.file('sample.ipynb'), CancellationToken.None);
		assert.ok(firstCell !== undefined, 'code should not be empty');
		assert.ok(firstCell.includes('import numpy as np'), 'code should include import numpy as np');

		const firstCellIsValid = await validatePythonCode(accessor, firstCell!);
		assert.ok(firstCellIsValid, 'code should be valid python code');
		cells.push(firstCell!);

		for (let i = 1; i < sections.length; i++) {
			const cell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[i], cells.join('\n'), 'python', URI.file('sample.ipynb'), CancellationToken.None);
			assert.ok(cell !== undefined, 'code should not be empty');
			assert.ok(!cell.includes('import numpy'), 'code should not include import numpy again');
			const cellIsValid = await validatePythonCode(accessor, cell!);
			assert.ok(cellIsValid, 'code should be valid python code');
			cells.push(cell!);
		}
	});

	stest({ description: 'Generate code cell (seaborn + pandas)', language: 'python' }, async (testingServiceCollection) => {
		const accessor = testingServiceCollection.createTestingAccessor();
		const endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-base');
		const topic = 'A Jupyter notebook that loads planets data from Seaborn and performs aggregation in Pandas.';
		const sections: INotebookSection[] = [
			{ title: 'Import Required Libraries', content: 'Import the necessary libraries, including Pandas and Seaborn.' },

			{ title: 'Load Planets Data', content: 'Load the planets data from Seaborn into a Pandas DataFrame.' },

			{ title: 'Data Cleaning', content: 'Clean the data by removing missing values and converting data types if necessary.' },

			{ title: 'Aggregation with GroupBy', content: 'Use the groupby() function to group the data…erform aggregation operations on the groups.' },

			{ title: 'Aggregation with Pivot Tables', content: 'Use the pivot_table() function to create a p… summarizes the data by one or more columns.' },
		];

		const cells: string[] = [];
		const firstCell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[0], '', 'python', URI.file('sample.ipynb'), CancellationToken.None);
		assert.ok(firstCell !== undefined, 'code should not be empty');
		assert.ok(firstCell.includes('import seaborn'), 'code should include import seaborn');
		assert.ok(firstCell.includes('import pandas'), 'code should include import pandas');

		const firstCellIsValid = await validatePythonCode(accessor, firstCell!);
		assert.ok(firstCellIsValid, 'code should be valid python code');
		cells.push(firstCell!);

		for (let i = 1; i < sections.length; i++) {
			const cell = await newNotebookCodeCell(accessor.get(IInstantiationService), accessor.get(IChatMLFetcher), endpoint, fetchConversationOptions(), undefined, topic, sections[i], cells.join('\n'), 'python', URI.file('sample.ipynb'), CancellationToken.None);
			assert.ok(cell !== undefined, 'code should not be empty');
			assert.ok(!cell.includes('import seaborn'), 'code should not include import seaborn again');
			assert.ok(!cell.includes('import pandas'), 'code should not include import pandas again');
			const cellIsValid = await validatePythonCode(accessor, cell!);
			assert.ok(cellIsValid, 'code should be valid python code');
			cells.push(cell!);
		}
	});
});

// async function validatePythonCode(pythonCode: string): Promise<boolean> {
// 	const validateCode = `
// import codeop
// import re

// def validate_python_code(code):
//     # Split the code into separate statements
//     statements = re.split(r"\\n(?=\\w)", code)
//     for statement in statements:
//         codeop.compile_command(statement)

// validate_python_code("""${pythonCode}""")
// `;
// 	if (pythonCode.startsWith('```')) {
// 		return false;
// 	}

// 	return new Promise((resolve) => {
// 		exec(`python3 -c "${validateCode.replace(/["\\]/g, '\\$&')}"`, (error, stdout, stderr) => {
// 			if (error) {
// 				return resolve(false);
// 			} else if (stderr && stderr.length > 0) {
// 				return resolve(false);
// 			}

// 			resolve(true);
// 		});
// 	});
// }

async function validatePythonCode(accessor: ITestingServicesAccessor, pythonCode: string): Promise<boolean> {
	const escapedPythonCode = pythonCode.replace(/`/g, 'BACKTICK_PLACEHOLDER');
	const validateCode = `
import codeop
import re

def validate_python_code(code):
    # Replace placeholder string with actual backtick
    code = code.replace('BACKTICK_PLACEHOLDER', chr(96))
    # Split the code into separate statements
    statements = re.split(r"\\n(?=\\w)", code)
    for statement in statements:
        codeop.compile_command(statement)

validate_python_code("""${escapedPythonCode}""")
`;
	return isValidPythonFile(accessor, validateCode);
}
