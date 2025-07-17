global class Component {
	global List<ApexPages.Component> childComponents;
	global List<ApexPages.ComponentIteration> componentIterations;
	global ApexPages.expressions expressions;
	global ApexPages.facets facets;
	global String id;
	global ApexPages.Component parent;
	global Boolean rendered;
	global Object clone() { }
	global ApexPages.Component getComponentById(String id) { }

}