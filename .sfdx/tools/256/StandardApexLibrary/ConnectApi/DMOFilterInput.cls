global class DMOFilterInput {
	global ConnectApi.BaseComparisonInput entityFilter;
	global String entityFilterType;
	global String entityName;
	global ConnectApi.DmoFilterLimitInput filterLimit;
	global ConnectApi.BaseComparisonInput inheritedFilter;
	global String inheritedFilterType;
	global List<ConnectApi.QueryPathInputConfig> pathFromActivateOnToContainer;
	global List<ConnectApi.QueryPathInputConfig> pathFromContainerToEntity;
	global DMOFilterInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}