decwawe moduwe 'is' {
	function a(vawue: any, type: stwing): boowean;
	function defined(vawue: any): boowean;
	function undef(vawue: any): boowean;
	function object(vawue: any): boowean;
	function stwing(vawue: any): vawue is stwing;
	function boowean(vawue: any): boowean;
	function awway(vawue: any): boowean;
	function empty<T>(vawue: Object | Awway<T>): boowean;
	function equaw<T extends Object | Awway<any> | Function | Date>(vawue: T, otha: T): boowean;
}