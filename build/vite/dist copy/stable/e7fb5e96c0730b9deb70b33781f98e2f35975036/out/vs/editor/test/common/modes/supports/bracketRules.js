/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const standardBracketRules = [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
];
export const rubyBracketRules = standardBracketRules;
export const cppBracketRules = standardBracketRules;
export const goBracketRules = standardBracketRules;
export const phpBracketRules = standardBracketRules;
export const vbBracketRules = standardBracketRules;
export const luaBracketRules = standardBracketRules;
export const htmlBracketRules = [
    ['<!--', '-->'],
    ['{', '}'],
    ['(', ')']
];
export const typescriptBracketRules = [
    ['${', '}'],
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
];
export const latexBracketRules = [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['[', ')'],
    ['(', ']'],
    ['\\left(', '\\right)'],
    ['\\left(', '\\right.'],
    ['\\left.', '\\right)'],
    ['\\left[', '\\right]'],
    ['\\left[', '\\right.'],
    ['\\left.', '\\right]'],
    ['\\left\\{', '\\right\\}'],
    ['\\left\\{', '\\right.'],
    ['\\left.', '\\right\\}'],
    ['\\left<', '\\right>'],
    ['\\bigl(', '\\bigr)'],
    ['\\bigl[', '\\bigr]'],
    ['\\bigl\\{', '\\bigr\\}'],
    ['\\Bigl(', '\\Bigr)'],
    ['\\Bigl[', '\\Bigr]'],
    ['\\Bigl\\{', '\\Bigr\\}'],
    ['\\biggl(', '\\biggr)'],
    ['\\biggl[', '\\biggr]'],
    ['\\biggl\\{', '\\biggr\\}'],
    ['\\Biggl(', '\\Biggr)'],
    ['\\Biggl[', '\\Biggr]'],
    ['\\Biggl\\{', '\\Biggr\\}'],
    ['\\langle', '\\rangle'],
    ['\\lvert', '\\rvert'],
    ['\\lVert', '\\rVert'],
    ['\\left|', '\\right|'],
    ['\\left\\vert', '\\right\\vert'],
    ['\\left\\|', '\\right\\|'],
    ['\\left\\Vert', '\\right\\Vert'],
    ['\\left\\langle', '\\right\\rangle'],
    ['\\left\\lvert', '\\right\\rvert'],
    ['\\left\\lVert', '\\right\\rVert'],
    ['\\bigl\\langle', '\\bigr\\rangle'],
    ['\\bigl|', '\\bigr|'],
    ['\\bigl\\vert', '\\bigr\\vert'],
    ['\\bigl\\lvert', '\\bigr\\rvert'],
    ['\\bigl\\|', '\\bigr\\|'],
    ['\\bigl\\lVert', '\\bigr\\rVert'],
    ['\\bigl\\Vert', '\\bigr\\Vert'],
    ['\\Bigl\\langle', '\\Bigr\\rangle'],
    ['\\Bigl|', '\\Bigr|'],
    ['\\Bigl\\lvert', '\\Bigr\\rvert'],
    ['\\Bigl\\vert', '\\Bigr\\vert'],
    ['\\Bigl\\|', '\\Bigr\\|'],
    ['\\Bigl\\lVert', '\\Bigr\\rVert'],
    ['\\Bigl\\Vert', '\\Bigr\\Vert'],
    ['\\biggl\\langle', '\\biggr\\rangle'],
    ['\\biggl|', '\\biggr|'],
    ['\\biggl\\lvert', '\\biggr\\rvert'],
    ['\\biggl\\vert', '\\biggr\\vert'],
    ['\\biggl\\|', '\\biggr\\|'],
    ['\\biggl\\lVert', '\\biggr\\rVert'],
    ['\\biggl\\Vert', '\\biggr\\Vert'],
    ['\\Biggl\\langle', '\\Biggr\\rangle'],
    ['\\Biggl|', '\\Biggr|'],
    ['\\Biggl\\lvert', '\\Biggr\\rvert'],
    ['\\Biggl\\vert', '\\Biggr\\vert'],
    ['\\Biggl\\|', '\\Biggr\\|'],
    ['\\Biggl\\lVert', '\\Biggr\\rVert'],
    ['\\Biggl\\Vert', '\\Biggr\\Vert']
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhY2tldFJ1bGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL2JyYWNrZXRSdWxlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLG9CQUFvQixHQUFvQjtJQUM3QyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7Q0FDVixDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsb0JBQW9CLENBQUM7QUFFckQsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLG9CQUFvQixDQUFDO0FBRXBELE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQztBQUVuRCxNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUM7QUFFcEQsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLG9CQUFvQixDQUFDO0FBRW5ELE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztBQUVwRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBb0I7SUFDaEQsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDO0lBQ2YsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO0lBQ1YsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO0NBQ1YsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFvQjtJQUN0RCxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7SUFDWCxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7SUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7Q0FDVixDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQW9CO0lBQ2pELENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztJQUNWLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQztJQUN2QixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7SUFDdkIsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDO0lBQ3ZCLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQztJQUN2QixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7SUFDdkIsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDO0lBQ3ZCLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQztJQUMzQixDQUFDLFdBQVcsRUFBRSxVQUFVLENBQUM7SUFDekIsQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDO0lBQ3pCLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQztJQUN2QixDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUM7SUFDdEIsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0lBQ3RCLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztJQUMxQixDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUM7SUFDdEIsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0lBQ3RCLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztJQUMxQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7SUFDeEIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO0lBQ3hCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztJQUM1QixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7SUFDeEIsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO0lBQ3hCLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztJQUM1QixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7SUFDeEIsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0lBQ3RCLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQztJQUN0QixDQUFDLFNBQVMsRUFBRSxVQUFVLENBQUM7SUFDdkIsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO0lBQ2pDLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQztJQUMzQixDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7SUFDakMsQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsQ0FBQztJQUNyQyxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQztJQUNuQyxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQztJQUNuQyxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDO0lBQ3BDLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQztJQUN0QixDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUM7SUFDaEMsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDO0lBQ2xDLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztJQUMxQixDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUM7SUFDbEMsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDO0lBQ2hDLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUM7SUFDcEMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0lBQ3RCLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQztJQUNsQyxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUM7SUFDaEMsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDO0lBQzFCLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQztJQUNsQyxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUM7SUFDaEMsQ0FBQyxpQkFBaUIsRUFBRSxpQkFBaUIsQ0FBQztJQUN0QyxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7SUFDeEIsQ0FBQyxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQztJQUNwQyxDQUFDLGVBQWUsRUFBRSxlQUFlLENBQUM7SUFDbEMsQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDO0lBQzVCLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUM7SUFDcEMsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDO0lBQ2xDLENBQUMsaUJBQWlCLEVBQUUsaUJBQWlCLENBQUM7SUFDdEMsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO0lBQ3hCLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUM7SUFDcEMsQ0FBQyxlQUFlLEVBQUUsZUFBZSxDQUFDO0lBQ2xDLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztJQUM1QixDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDO0lBQ3BDLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQztDQUNsQyxDQUFDIn0=