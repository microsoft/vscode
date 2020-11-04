'use strict';
var Conway;
(function (Conway) {
    var Cell = (function () {
        function Cell() {
        }
        return Cell;
    })();
    (function (property, number, property, number, property, boolean) {
        if (property === undefined) { property = row; }
        if (property === undefined) { property = col; }
        if (property === undefined) { property = live; }
    });
    var GameOfLife = (function () {
        function GameOfLife() {
        }
        return GameOfLife;
    })();
    (function () {
        property;
        gridSize = 50;
        property;
        canvasSize = 600;
        property;
        lineColor = '#cdcdcd';
        property;
        liveColor = '#666';
        property;
        deadColor = '#eee';
        property;
        initialLifeProbability = 0.5;
        property;
        animationRate = 60;
        property;
        cellSize = 0;
        property;
        context: ICanvasRenderingContext2D;
        property;
        world = createWorld();
        circleOfLife();
        function createWorld() {
            return travelWorld(function (cell) {
                cell.live = Math.random() < initialLifeProbability;
                return cell;
            });
        }
        function circleOfLife() {
            world = travelWorld(function (cell) {
                cell = world[cell.row][cell.col];
                draw(cell);
                return resolveNextGeneration(cell);
            });
            setTimeout(function () { circleOfLife(); }, animationRate);
        }
        function resolveNextGeneration(cell) {
            var count = countNeighbors(cell);
            var newCell = new Cell(cell.row, cell.col, cell.live);
            if (count < 2 || count > 3)
                newCell.live = false;
            else if (count == 3)
                newCell.live = true;
            return newCell;
        }
        function countNeighbors(cell) {
            var neighbors = 0;
            for (var row = -1; row <= 1; row++) {
                for (var col = -1; col <= 1; col++) {
                    if (row == 0 && col == 0)
                        continue;
                    if (isAlive(cell.row + row, cell.col + col)) {
                        neighbors++;
                    }
                }
            }
            return neighbors;
        }
        function isAlive(row, col) {
            // todo - need to guard with worl[row] exists?
            if (row < 0 || col < 0 || row >= gridSize || col >= gridSize)
                return false;
            return world[row][col].live;
        }
        function travelWorld(callback) {
            var result = [];
            for (var row = 0; row < gridSize; row++) {
                var rowData = [];
                for (var col = 0; col < gridSize; col++) {
                    rowData.push(callback(new Cell(row, col, false)));
                }
                result.push(rowData);
            }
            return result;
        }
        function draw(cell) {
            if (context == null)
                context = createDrawingContext();
            if (cellSize == 0)
                cellSize = canvasSize / gridSize;
            context.strokeStyle = lineColor;
            context.strokeRect(cell.row * cellSize, cell.col * cellSize, cellSize, cellSize);
            context.fillStyle = cell.live ? liveColor : deadColor;
            context.fillRect(cell.row * cellSize, cell.col * cellSize, cellSize, cellSize);
        }
        function createDrawingContext() {
            var canvas = document.getElementById('conway-canvas');
            if (canvas == null) {
                canvas = document.createElement('canvas');
                canvas.id = "conway-canvas";
                canvas.width = canvasSize;
                canvas.height = canvasSize;
                document.body.appendChild(canvas);
            }
            return canvas.getContext('2d');
        }
    });
})(Conway || (Conway = {}));
var game = new Conway.GameOfLife();
