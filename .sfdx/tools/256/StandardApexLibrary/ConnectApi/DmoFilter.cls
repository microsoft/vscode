global class DmoFilter {
	global ConnectApi.BaseComparison entityFilter;
	global String entityFilterType;
	global String entityName;
	global ConnectApi.DmoFilterLimit filterLimit;
	global ConnectApi.BaseComparison inheritedFilter;
	global String inheritedFilterType;
	global ConnectApi.QueryPathConfigList pathFromActivateOnToContainer;
	global ConnectApi.QueryPathConfigList pathFromContainerToEntity;
	global DmoFilter() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}