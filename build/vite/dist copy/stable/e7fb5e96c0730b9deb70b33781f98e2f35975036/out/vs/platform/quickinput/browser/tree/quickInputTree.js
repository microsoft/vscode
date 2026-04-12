/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function getParentNodeState(parentChildren) {
    let containsChecks = false;
    let containsUnchecks = false;
    let containsMixed = false;
    for (const element of parentChildren) {
        switch (element.element?.checked) {
            case 'mixed':
                containsMixed = true;
                break;
            case true:
                containsChecks = true;
                break;
            default:
                containsUnchecks = true;
                break;
        }
        if (containsChecks && containsUnchecks && containsMixed) {
            break;
        }
    }
    const newState = containsUnchecks
        ? containsMixed
            ? 'mixed'
            : containsChecks
                ? 'mixed'
                : false
        : containsMixed
            ? 'mixed'
            : containsChecks;
    return newState;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFRyZWUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvdHJlZS9xdWlja0lucHV0VHJlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQVdoRyxNQUFNLFVBQVUsa0JBQWtCLENBQUMsY0FBK0c7SUFDakosSUFBSSxjQUFjLEdBQUcsS0FBSyxDQUFDO0lBQzNCLElBQUksZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0lBQzdCLElBQUksYUFBYSxHQUFHLEtBQUssQ0FBQztJQUUxQixLQUFLLE1BQU0sT0FBTyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3RDLFFBQVEsT0FBTyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUNsQyxLQUFLLE9BQU87Z0JBQ1gsYUFBYSxHQUFHLElBQUksQ0FBQztnQkFDckIsTUFBTTtZQUNQLEtBQUssSUFBSTtnQkFDUixjQUFjLEdBQUcsSUFBSSxDQUFDO2dCQUN0QixNQUFNO1lBQ1A7Z0JBQ0MsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixNQUFNO1FBQ1IsQ0FBQztRQUNELElBQUksY0FBYyxJQUFJLGdCQUFnQixJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ3pELE1BQU07UUFDUCxDQUFDO0lBQ0YsQ0FBQztJQUNELE1BQU0sUUFBUSxHQUFHLGdCQUFnQjtRQUNoQyxDQUFDLENBQUMsYUFBYTtZQUNkLENBQUMsQ0FBQyxPQUFPO1lBQ1QsQ0FBQyxDQUFDLGNBQWM7Z0JBQ2YsQ0FBQyxDQUFDLE9BQU87Z0JBQ1QsQ0FBQyxDQUFDLEtBQUs7UUFDVCxDQUFDLENBQUMsYUFBYTtZQUNkLENBQUMsQ0FBQyxPQUFPO1lBQ1QsQ0FBQyxDQUFDLGNBQWMsQ0FBQztJQUNuQixPQUFPLFFBQVEsQ0FBQztBQUNqQixDQUFDIn0=