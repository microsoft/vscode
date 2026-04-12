/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class AbstractSignService {
    constructor() {
        this.validators = new Map();
    }
    static { this._nextId = 1; }
    async createNewMessage(value) {
        try {
            const validator = await this.getValidator();
            if (validator) {
                const id = String(AbstractSignService._nextId++);
                this.validators.set(id, validator);
                return {
                    id: id,
                    data: validator.createNewMessage(value)
                };
            }
        }
        catch (e) {
            // ignore errors silently
        }
        return { id: '', data: value };
    }
    async validate(message, value) {
        if (!message.id) {
            return true;
        }
        const validator = this.validators.get(message.id);
        if (!validator) {
            return false;
        }
        this.validators.delete(message.id);
        try {
            return (validator.validate(value) === 'ok');
        }
        catch (e) {
            // ignore errors silently
            return false;
        }
        finally {
            validator.dispose?.();
        }
    }
    async sign(value) {
        try {
            return await this.signValue(value);
        }
        catch (e) {
            // ignore errors silently
        }
        return value;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RTaWduU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3NpZ24vY29tbW9uL2Fic3RyYWN0U2lnblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFjaEcsTUFBTSxPQUFnQixtQkFBbUI7SUFBekM7UUFJa0IsZUFBVSxHQUFHLElBQUksR0FBRyxFQUEwQixDQUFDO0lBa0RqRSxDQUFDO2FBbkRlLFlBQU8sR0FBRyxDQUFDLEFBQUosQ0FBSztJQU1wQixLQUFLLENBQUMsZ0JBQWdCLENBQUMsS0FBYTtRQUMxQyxJQUFJLENBQUM7WUFDSixNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUM1QyxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ25DLE9BQU87b0JBQ04sRUFBRSxFQUFFLEVBQUU7b0JBQ04sSUFBSSxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7aUJBQ3ZDLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWix5QkFBeUI7UUFDMUIsQ0FBQztRQUNELE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUFpQixFQUFFLEtBQWE7UUFDOUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUM7WUFDSixPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUM3QyxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLHlCQUF5QjtZQUN6QixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7Z0JBQVMsQ0FBQztZQUNWLFNBQVMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDO1FBQ3ZCLENBQUM7SUFDRixDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFhO1FBQ3ZCLElBQUksQ0FBQztZQUNKLE9BQU8sTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1oseUJBQXlCO1FBQzFCLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUMifQ==