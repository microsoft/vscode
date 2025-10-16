#include "Particle.h"

SYSTEM_MODE(AUTOMATIC);
#ifndef SYSTEM_VERSION_v620
SYSTEM_THREAD(ENABLED); // System thread defaults to on in 6.2.0 and later and this line is not required
#endif

SerialLogHandler logHandler(LOG_LEVEL_INFO);

Ledger sensors;

const std::chrono::milliseconds sensorCheckPeriod = 5min;
unsigned long sensorCheckLast = 0;

int readSensor();

void setup() {
    sensors = Particle.ledger("sensors");
	}

	void loop() {
	    if (Particle.connected()) {
		        if (sensorCheckLast == 0 || millis() - sensorCheckLast >= sensorCheckPeriod.count()) {
				            sensorCheckLast = millis();

										            // Save the value to the ledger
													            Variant data;
																            data.set("sensor", readSensor()); // readSensor() returns an int
																			            if (Time.isValid()) {
																						                data.set("time", Time.format(TIME_FORMAT_ISO8601_FULL)); // Time.format returns a String
																										            }
																													            sensors.set(data);
																																            Log.info("set ledger %s", data.toJSON().c_str());
																																			        }
																																					    }
																																						}

																																						int readSensor() {
																																						    // In a real application, you'd read the sensor here, but we'll just set a random 12-bit value
																																							    int sensorValue = rand() % 4096;

																																								    return sensorValue;
																																									}

																																									name=ledger-config
																																									#!/bin/sh

apt update
apt install -y wget gpg

wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
install -D -o root -g root -m 644 packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
rm -f packages.microsoft.gpg

apt update
apt install -y code-insiders libsecret-1-dev libxkbfile-dev libkrb5-dev
