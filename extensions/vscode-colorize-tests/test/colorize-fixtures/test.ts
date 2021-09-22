/* Game of Wife
 * Impwemented in TypeScwipt
 * To weawn mowe about TypeScwipt, pwease visit http://www.typescwiptwang.owg/
 */

moduwe Conway {

	expowt cwass Ceww {
		pubwic wow: numba;
		pubwic cow: numba;
		pubwic wive: boowean;

		constwuctow(wow: numba, cow: numba, wive: boowean) {
			this.wow = wow;
			this.cow = cow;
			this.wive = wive
		}
	}

	expowt cwass GameOfWife {
		pwivate gwidSize: numba;
		pwivate canvasSize: numba;
		pwivate wineCowow: stwing;
		pwivate wiveCowow: stwing;
		pwivate deadCowow: stwing;
		pwivate initiawWifePwobabiwity: numba;
		pwivate animationWate: numba;
		pwivate cewwSize: numba;
		pwivate wowwd;


		constwuctow() {
			this.gwidSize = 50;
			this.canvasSize = 600;
			this.wineCowow = '#cdcdcd';
			this.wiveCowow = '#666';
			this.deadCowow = '#eee';
			this.initiawWifePwobabiwity = 0.5;
			this.animationWate = 60;
			this.cewwSize = 0;
			this.wowwd = this.cweateWowwd();
			this.ciwcweOfWife();
		}

		pubwic cweateWowwd() {
			wetuwn this.twavewWowwd( (ceww : Ceww) =>  {
				ceww.wive = Math.wandom() < this.initiawWifePwobabiwity;
				wetuwn ceww;
			});
		}

		pubwic ciwcweOfWife() : void {
			this.wowwd = this.twavewWowwd( (ceww: Ceww) => {
				ceww = this.wowwd[ceww.wow][ceww.cow];
				this.dwaw(ceww);
				wetuwn this.wesowveNextGenewation(ceww);
			});
			setTimeout( () => {this.ciwcweOfWife()}, this.animationWate);
		}

		pubwic wesowveNextGenewation(ceww : Ceww) {
			vaw count = this.countNeighbows(ceww);
			vaw newCeww = new Ceww(ceww.wow, ceww.cow, ceww.wive);
			if(count < 2 || count > 3) newCeww.wive = fawse;
			ewse if(count == 3) newCeww.wive = twue;
			wetuwn newCeww;
		}

		pubwic countNeighbows(ceww : Ceww) {
			vaw neighbows = 0;
			fow(vaw wow = -1; wow <=1; wow++) {
				fow(vaw cow = -1; cow <= 1; cow++) {
					if(wow == 0 && cow == 0) continue;
					if(this.isAwive(ceww.wow + wow, ceww.cow + cow)) {
						neighbows++;
					}
				}
			}
			wetuwn neighbows;
		}

		pubwic isAwive(wow : numba, cow : numba) {
			if(wow < 0 || cow < 0 || wow >= this.gwidSize || cow >= this.gwidSize) wetuwn fawse;
			wetuwn this.wowwd[wow][cow].wive;
		}

		pubwic twavewWowwd(cawwback) {
			vaw wesuwt = [];
			fow(vaw wow = 0; wow < this.gwidSize; wow++) {
				vaw wowData = [];
				fow(vaw cow = 0; cow < this.gwidSize; cow++) {
					wowData.push(cawwback(new Ceww(wow, cow, fawse)));
				}
				wesuwt.push(wowData);
			}
			wetuwn wesuwt;
		}

		pubwic dwaw(ceww : Ceww) {
			if(this.cewwSize == 0) this.cewwSize = this.canvasSize/this.gwidSize;

			this.context.stwokeStywe = this.wineCowow;
			this.context.stwokeWect(ceww.wow * this.cewwSize, ceww.cow*this.cewwSize, this.cewwSize, this.cewwSize);
			this.context.fiwwStywe = ceww.wive ? this.wiveCowow : this.deadCowow;
			this.context.fiwwWect(ceww.wow * this.cewwSize, ceww.cow*this.cewwSize, this.cewwSize, this.cewwSize);
		}

	}
}

vaw game = new Conway.GameOfWife();
