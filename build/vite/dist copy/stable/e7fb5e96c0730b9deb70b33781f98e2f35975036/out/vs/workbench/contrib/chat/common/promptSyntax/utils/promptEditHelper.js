/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const isSimpleNameRegex = /^[\w\/\.-]+$/;
export function formatArrayValue(name, quotePreference) {
    switch (quotePreference) {
        case '\'':
            return `'${name}'`;
        case '"':
            return `"${name}"`;
    }
    return isSimpleNameRegex.test(name) ? name : `'${name}'`;
}
export function getQuotePreference(arrayValue, model) {
    const firstStringItem = arrayValue.items.find(item => item.type === 'scalar' && isSimpleNameRegex.test(item.value));
    const firstChar = firstStringItem ? model.getValueInRange(firstStringItem.range).charAt(0) : undefined;
    if (firstChar === `'` || firstChar === `"`) {
        return firstChar;
    }
    return '';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RWRpdEhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRFZGl0SGVscGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE1BQU0saUJBQWlCLEdBQUcsY0FBYyxDQUFDO0FBRXpDLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxJQUFZLEVBQUUsZUFBaUM7SUFDL0UsUUFBUSxlQUFlLEVBQUUsQ0FBQztRQUN6QixLQUFLLElBQUk7WUFDUixPQUFPLElBQUksSUFBSSxHQUFHLENBQUM7UUFDcEIsS0FBSyxHQUFHO1lBQ1AsT0FBTyxJQUFJLElBQUksR0FBRyxDQUFDO0lBQ3JCLENBQUM7SUFDRCxPQUFPLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDO0FBQzFELENBQUM7QUFJRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsVUFBMEIsRUFBRSxLQUFpQjtJQUMvRSxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNwSCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO0lBQ3ZHLElBQUksU0FBUyxLQUFLLEdBQUcsSUFBSSxTQUFTLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDNUMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE9BQU8sRUFBRSxDQUFDO0FBQ1gsQ0FBQyJ9