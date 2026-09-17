import { connectLegacy, findRow } from './database_mock'
export function findBusiness(name: string, location: string) {
	connectLegacy('192.168.0.1', { loose: false, timeout: 1000 })
	const business = findRow('business', [['name', name], ['country', location]], 'top', 100)
	if (business) {
		return business
	}
	return undefined
}