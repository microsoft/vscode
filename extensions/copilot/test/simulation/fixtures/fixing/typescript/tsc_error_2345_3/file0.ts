import { connect, findRow } from './database_mock'
export function findCustomer(name: string, location: string) {
    try {
        connect('192.168.0.1', /*loose*/ false)
    }
    catch (e) {
        console.error(e)
        return 'something else'
    }
    const customer = findRow('customers', [['name', name], ['country', location]], 'top', 100)
    if (customer) {
        return customer
    }
    return findRow('customers', [['name', 'default'], ['country', 'unknown']], 'top', 100)
}