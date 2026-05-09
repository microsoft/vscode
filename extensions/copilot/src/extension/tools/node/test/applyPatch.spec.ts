/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { AbstractDocumentWithLanguageId, StringTextDocument } from '../../../../platform/editing/common/abstractText';
import { processPatch } from '../applyPatch/parser';

describe('ApplyPatch parser', function () {
	it('Can parse notebook edits (without infinite loop)', async function () {
		const input = `*** Begin Patch
*** Update File: /Users/donjayamanne/temp/sample3/titanic_analysis.ipynb
@@<VSCode.Cell id="4b90c16e" language="python">
-import requests
-asdfasf
-url = 'https://repo/titanic.csv'
-response = requests.get(url)
-with open('titanic.csv', 'wb') as file:
-    file.write(response.content)
-print("Dataset downloaded and saved as 'titanic.csv'.")
+import requests
+url = 'https://repo/titanic.csv'
+response = requests.get(url)
+with open('titanic.csv', 'wb') as file:
+    file.write(response.content)
+print("Dataset downloaded and saved as 'titanic.csv'.")
*** End Patch`;
		const notebookContent = `<VSCode.Cell id="04022f0b" language="markdown">
# Titanic Dataset Analysis
This notebook performs an analysis of the Titanic dataset, including data cleaning, exploration, and visualization.
</VSCode.Cell>
<VSCode.Cell id="ba29644f" language="markdown">
## Download Titanic Dataset
Download the Titanic dataset from an online source and save it locally.
</VSCode.Cell>
<VSCode.Cell id="4b90c16e" language="python">
import requests
asdfasf
url = 'https://repo/titanic.csv'
response = requests.get(url)
with open('titanic.csv', 'wb') as file:
    file.write(response.content)
print("Dataset downloaded and saved as 'titanic.csv'.")
</VSCode.Cell>
<VSCode.Cell id="6c10645e" language="markdown">
## Load and Inspect the Dataset
Load the dataset into a pandas DataFrame and inspect its structure.
</VSCode.Cell>
<VSCode.Cell id="9cd9c3fb" language="python">
import pandas as pd

data = pd.read_csv('titanic.csv')
print(data.head())
print(data.info())
print(data.describe())
</VSCode.Cell>
<VSCode.Cell id="dcbfa123" language="markdown">
## Clean the Dataset
Handle missing values and drop unnecessary columns to prepare the dataset for analysis.
</VSCode.Cell>
<VSCode.Cell id="02a047e7" language="python">
# Drop columns that are not needed
data = data.drop(['PassengerId', 'Name', 'Ticket', 'Cabin'], axis=1)

# Fill missing values
data['Age'] = data['Age'].fillna(data['Age'].median())
data['Embarked'] = data['Embarked'].fillna(data['Embarked'].mode()[0])

print(data.isnull().sum())
</VSCode.Cell>
<VSCode.Cell id="39584020" language="markdown">
## Survival Rate by Gender
Analyze and visualize the survival rate by gender.
</VSCode.Cell>
<VSCode.Cell id="f141a79e" language="python">
import matplotlib.pyplot as plt
import seaborn as sns

survival_by_gender = data.groupby('Sex')['Survived'].mean()
survival_by_gender.plot(kind='bar', color=['blue', 'pink'])
plt.title('Survival Rate by Gender')
plt.ylabel('Survival Rate')
plt.show()
</VSCode.Cell>
<VSCode.Cell id="7f98e5ae" language="markdown">
## Survival Rate by Passenger Class
Analyze and visualize the survival rate by passenger class.
</VSCode.Cell>
<VSCode.Cell id="d5c4e352" language="python">
survival_by_class = data.groupby('Pclass')['Survived'].mean()
survival_by_class.plot(kind='bar', color='green')
plt.title('Survival Rate by Passenger Class')
plt.ylabel('Survival Rate')
plt.show()
</VSCode.Cell>
<VSCode.Cell id="77b28010" language="markdown">
## Age Distribution of Passengers
Visualize the age distribution of passengers using a histogram.
</VSCode.Cell>
<VSCode.Cell id="b887ced3" language="python">
data['Age'].plot(kind='hist', bins=30, color='purple', edgecolor='black')
plt.title('Age Distribution of Passengers')
plt.xlabel('Age')
plt.ylabel('Frequency')
plt.show()
</VSCode.Cell>
<VSCode.Cell id="cc345033" language="markdown">
## Visualize Correlations
Use a heatmap to visualize correlations between numerical features in the dataset.
</VSCode.Cell>
<VSCode.Cell id="9ff8c5be" language="python">
correlation_matrix = data.corr()
sns.heatmap(correlation_matrix, annot=True, cmap='coolwarm')
plt.title('Correlation Heatmap')
plt.show()
</VSCode.Cell>`;

		const patch = await processPatch(input, () => Promise.resolve(new StringTextDocumentWithLanguageId('xml', notebookContent)));
		expect(patch).toBeDefined();
	});


	it.skip('Can parse notebook edits (jupytext)', async function () {
		const input = `*** Begin Patch
*** Update File: /Users/donjayamanne/demo/one.ipynb
@@
-#%% vscode.cell [id=b7926f01] [language=markdown]
-"""
-Hello
-"""
+#%% vscode.cell [id=b7926f01] [language=markdown]
+"""
+# Cell 1: This is a markdown cell that says Hello
+Hello
+"""
@@
-#%% vscode.cell [id=2f694e8c] [language=python]
-print(1)
+#%% vscode.cell [id=2f694e8c] [language=python]
+# Cell 2: Print the number 1
+print(1)
@@
-#%% vscode.cell [id=142a5490] [language=python]
-1234
+#%% vscode.cell [id=142a5490] [language=python]
+# Cell 3: Output the number 1234
+1234
@@
-#%% vscode.cell [id=2c994136] [language=python]
-import sys
+#%% vscode.cell [id=2c994136] [language=python]
+# Cell 4: Import the sys module
+import sys
@@
-#%% vscode.cell [id=d7161d69] [language=python]
-sys.executable
+#%% vscode.cell [id=d7161d69] [language=python]
+# Cell 5: Display the path to the Python executable
+sys.executable
*** End Patch`;
		const notebookContent = `#%% vscode.cell [id=b7926f01] [language=markdown]
"""
Hello
"""
#%% vscode.cell [id=2f694e8c] [language=python]
print(1)
#%% vscode.cell [id=142a5490] [language=python]
1234
#%% vscode.cell [id=2c994136] [language=python]
import sys
#%% vscode.cell [id=d7161d69] [language=python]
sys.executable`;

		const patch = await processPatch(input, () => Promise.resolve(new StringTextDocumentWithLanguageId('xml', notebookContent)));
		expect(patch).toBeDefined();
	});

	it.skip('Can parse notebook edits for two cells (jupytext)', async function () {
		const input = `*** Begin Patch
*** Update File: /Users/donjayamanne/demo/one copy.ipynb
@@
-#%% vscode.cell [id=ec528bae] [language=markdown]
-"""
-Hello
-"""
+#%% vscode.cell [id=ec528bae] [language=markdown]
+"""
+# Cell 1: This markdown cell introduces the notebook.
+Hello
+"""
@@
-#%% vscode.cell [id=05e875f9] [language=python]
-print(1)
+#%% vscode.cell [id=05e875f9] [language=python]
+# Cell 2: This code cell prints the number 1.
+print(1)
*** End Patch`;
		const notebookContent = `#%% vscode.cell [id=ec528bae] [language=markdown]
"""
Hello
"""
#%% vscode.cell [id=05e875f9] [language=python]
print(1)`;

		const patch = await processPatch(input, () => Promise.resolve(new StringTextDocumentWithLanguageId('xml', notebookContent)));
		expect(patch).toBeDefined();
	});
});


class StringTextDocumentWithLanguageId extends StringTextDocument implements AbstractDocumentWithLanguageId {
	constructor(public readonly languageId: string, text: string) {
		super(text);
	}
}
