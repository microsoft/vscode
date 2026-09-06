import { connect } from './database_mock'
function justConnect(name: string, location: string) {
	return connect('192.168.0.1', 1000, /*loose*/ true)
}