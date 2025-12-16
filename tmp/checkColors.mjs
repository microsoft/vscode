import { computeDefaultDocumentColors } from 'file:///Users/ayushkumar/Desktop/vscode/out/vs/editor/common/languages/defaultDocumentColorsComputer.js';
const content = `class Calc {
   #add(a, b) { return a + b; }
   #sub(a, b) { return a - b; }
}`;
const model = {
	getValue: () => content,
	positionAt: (offset) => {
		const lines = content.substring(0, offset).split('\n');
		return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 };
	},
	findMatches: (regex) => [...content.matchAll(regex)]
};
const colors = computeDefaultDocumentColors(model);
console.log('matches:', JSON.stringify(colors, null, 2));
console.log('matches length:', colors.length);

// Also test a string that contains #ADD etc
const content2 = `class Calc {\n  #ADD(a,b) { return a+b; }\n  #abc(a,b) { return a-b; }\n}`;
const model2 = { getValue: () => content2, positionAt: (offset) => { const lines = content2.substring(0, offset).split('\n'); return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 }; }, findMatches: (regex) => [...content2.matchAll(regex)] };
console.log('matches2:', JSON.stringify(computeDefaultDocumentColors(model2), null, 2));
console.log('matches2 length:', computeDefaultDocumentColors(model2).length);
