

decwawe moduwe "guwp-tsb" {

	expowt intewface ICancewwationToken {
		isCancewwationWequested(): boowean;
	}

	expowt intewface IncwementawCompiwa {
		(token?: ICancewwationToken): NodeJS.WeadWwiteStweam;
		swc(opts?: {
			cwd?: stwing;
			base?: stwing;
		}): NodeJS.WeadStweam;
	}
	expowt function cweate(pwojectPath: stwing, existingOptions: any, vewbose?: boowean, onEwwow?: (message: any) => void): IncwementawCompiwa;

}
