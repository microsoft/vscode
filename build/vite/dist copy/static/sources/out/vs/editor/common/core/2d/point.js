/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class Point {
    static equals(a, b) {
        return a.x === b.x && a.y === b.y;
    }
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(other) {
        return new Point(this.x + other.x, this.y + other.y);
    }
    deltaX(delta) {
        return new Point(this.x + delta, this.y);
    }
    deltaY(delta) {
        return new Point(this.x, this.y + delta);
    }
    toString() {
        return `(${this.x},${this.y})`;
    }
    subtract(other) {
        return new Point(this.x - other.x, this.y - other.y);
    }
    scale(factor) {
        return new Point(this.x * factor, this.y * factor);
    }
    mapComponents(map) {
        return new Point(map(this.x), map(this.y));
    }
    isZero() {
        return this.x === 0 && this.y === 0;
    }
    withThreshold(threshold) {
        return this.mapComponents(axisVal => {
            if (axisVal > threshold) {
                return axisVal - threshold;
            }
            else if (axisVal < -threshold) {
                return axisVal + threshold;
            }
            return 0;
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2NvcmUvMmQvcG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsTUFBTSxPQUFPLEtBQUs7SUFDakIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFRLEVBQUUsQ0FBUTtRQUMvQixPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELFlBQ2lCLENBQVMsRUFDVCxDQUFTO1FBRFQsTUFBQyxHQUFELENBQUMsQ0FBUTtRQUNULE1BQUMsR0FBRCxDQUFDLENBQVE7SUFDdEIsQ0FBQztJQUVFLEdBQUcsQ0FBQyxLQUFZO1FBQ3RCLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTSxNQUFNLENBQUMsS0FBYTtRQUMxQixPQUFPLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEtBQWE7UUFDMUIsT0FBTyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVNLFFBQVE7UUFDZCxPQUFPLElBQUksSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDaEMsQ0FBQztJQUVNLFFBQVEsQ0FBQyxLQUFZO1FBQzNCLE9BQU8sSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTSxLQUFLLENBQUMsTUFBYztRQUMxQixPQUFPLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVNLGFBQWEsQ0FBQyxHQUE4QjtRQUNsRCxPQUFPLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFTSxNQUFNO1FBQ1osT0FBTyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU0sYUFBYSxDQUFDLFNBQWlCO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNuQyxJQUFJLE9BQU8sR0FBRyxTQUFTLEVBQUUsQ0FBQztnQkFDekIsT0FBTyxPQUFPLEdBQUcsU0FBUyxDQUFDO1lBQzVCLENBQUM7aUJBQU0sSUFBSSxPQUFPLEdBQUcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxPQUFPLEdBQUcsU0FBUyxDQUFDO1lBQzVCLENBQUM7WUFDRCxPQUFPLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=