void main() {
    …
    if (remappedDifference > 0) {…} else if (remappedDifference < 0) {
        Serial.println("Turning counterclockwise...");
        …
    } /* else {
        Serial.println("Stopping servo...");
        controlServo(SERVO_STOP); // Stop the servo if the difference is zero
    } */
}
