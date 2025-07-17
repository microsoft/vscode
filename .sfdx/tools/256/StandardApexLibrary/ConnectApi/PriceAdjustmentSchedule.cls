global class PriceAdjustmentSchedule {
	global ConnectApi.PriceAdjustmentScheduleAdjustmentMethod adjustmentMethod;
	global String id;
	global List<ConnectApi.PriceAdjustmentTier> priceAdjustmentTiers;
	global ConnectApi.PriceAdjustmentScheduleType scheduleType;
	global PriceAdjustmentSchedule() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}