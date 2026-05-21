void main() {
    // Trigger servo movement based on the difference
    if (remappedDifference > 0) {
        Serial.println("Turning clockwise...");
        controlServo(SERVO_CW); // Spin the servo clockwise
    } else if (remappedDifference < 0) {
        Serial.println("Turning counterclockwise...");
        controlServo(SERVO_CCW); // Spin the servo counterclockwise
    } /* else {
        Serial.println("Stopping servo...");
        controlServo(SERVO_STOP); // Stop the servo if the difference is zero
    } */
}
