global class Script {
	global Object clone() { }
	global static dataweave.Script createScript(String namespace, String scriptName) { }
	global static dataweave.Script createScript(String scriptName) { }
	global dataweave.Result execute(Map<String,Object> parameters) { }
	global dataweave.Result execute() { }
	global String toString() { }

}