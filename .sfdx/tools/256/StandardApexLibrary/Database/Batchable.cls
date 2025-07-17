global interface Batchable {
	void execute(Database.BatchableContext param0, List<Object> param1);
	void finish(Database.BatchableContext param0);
	System.Iterable start(Database.BatchableContext param0);

}