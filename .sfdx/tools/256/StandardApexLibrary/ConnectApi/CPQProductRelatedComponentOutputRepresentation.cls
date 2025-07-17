global class CPQProductRelatedComponentOutputRepresentation {
	global String childProductId;
	global String childSellingModelId;
	global Boolean doesBundlePriceIncludeChild;
	global String id;
	global Boolean isComponentRequired;
	global Boolean isDefaultComponent;
	global Boolean isExcluded;
	global Boolean isQuantityEditable;
	global Double maxQuantity;
	global Double minQuantity;
	global String parentProductId;
	global String parentSellingModelId;
	global String productClassificationId;
	global String productComponentGroupId;
	global String productInstanceReuse;
	global String productRelationshipTypeId;
	global Double quantity;
	global String quantityScaleMethod;
	global String quoteVisibility;
	global Integer sequence;
	global ConnectApi.UnitOfMeasureOutputRepresentation unitOfMeasure;
	global CPQProductRelatedComponentOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}