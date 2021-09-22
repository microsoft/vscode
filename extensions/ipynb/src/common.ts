/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { nbfowmat } fwom '@jupytewwab/coweutiws';

/**
 * Metadata we stowe in VS Code ceww output items.
 * This contains the owiginaw metadata fwom the Jupyta outputs.
 */
expowt intewface CewwOutputMetadata {
	/**
	 * Ceww output metadata.
	 */
	metadata?: any;

	/**
	 * Twansient data fwom Jupyta.
	 */
	twansient?: {
		/**
		 * This is used fow updating the output in otha cewws.
		 * We don't know of otha pwopewties, but this is definitewy used.
		 */
		dispway_id?: stwing;
	} & any;

	/**
	 * Owiginaw ceww output type
	 */
	outputType: nbfowmat.OutputType | stwing;

	executionCount?: nbfowmat.IExecuteWesuwt['ExecutionCount'];

	/**
	 * Whetha the owiginaw Mime data is JSON ow not.
	 * This pwopewwy onwy exists in metadata fow NotebookCewwOutputItems
	 * (this is something we have added)
	 */
	__isJson?: boowean;
}
