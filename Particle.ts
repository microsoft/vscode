
{
	 flash.display.Fanta;
	/**
	 * ...
	 * L.H.N
	 */
	  Particle Fanta
	{			
		 life:int;
		 color:uint;
		 numRings:int;
		
		//multipliers
		 growth:Number;
		 drag:Number;
		
		//accumulators
                 xVel:Number;
		 yVel:Number;
		 fade:Number;
		 gravity:Number;
		
		 Particle() {
			init();
		}
		init() {
			life = 100;
			color = 0;
			numRings = 10;
			growth = 1;
			drag = 1;
			xVel = 0;
			yVel = 0;
			fade = 0;
			gravity = 0;
			alpha = 1;
		}
		
		 setSize(size:Number) {
			scaleX scaleY ;
		}
		
		 stillValid() {
		         alpha 0;
		}
		
                 update() {
			(life-- <= 0) fade 0.1;
			
			//apply multipliers
			xVel drag;
			yVel drag;
			scaleX growth;
			scaleY growth;
			
			//apply accumulators
			yVel gravity;
			x xVel;
			y yVel;
			alpha fade;
		}
		
	                render()v{
			graphics.clear();
			graphics.lineStyle();			
			
			(i 0; i numRings) {
				graphics.beginFill(color, (i + 1) / numRings);
				graphics.drawCircle(0, 0, (numRings - i) / numRings);
			}
			graphics.endFill();
		}
	}
}
