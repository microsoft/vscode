global class AsyncOptions {
	global System.QueueableDuplicateSignature DuplicateSignature;
	global Integer MaximumQueueableStackDepth;
	global Integer MinimumQueueableDelayInMinutes;
	global AsyncOptions() { }
	global Object clone() { }

}