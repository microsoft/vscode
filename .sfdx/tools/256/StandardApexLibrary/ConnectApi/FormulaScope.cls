global class FormulaScope {
	global Map<String,String> contextValues;
	global Map<String,Object> contextValuesMap;
	global List<String> fields;
	global String formula;
	global FormulaScope() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}