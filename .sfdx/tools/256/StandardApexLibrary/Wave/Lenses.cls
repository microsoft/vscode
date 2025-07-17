global class Lenses {
	global Lenses() { }
	global Object clone() { }
	global static Map<String,Object> getLens(String lensIdOrApiName, String filterGroup) { }
	global static Map<String,Object> getLens(String lensIdOrApiName) { }
	global static Map<String,Object> getLenses(wave.LensesSearchOptions options) { }
	global static Map<String,Object> getLenses() { }

}