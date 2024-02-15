/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ObservablePromise, autorun, autorunHandleChanges, derived, derivedWithCancellationToken, observableValue, transaction } from 'vs/base/common/observable';

export class PlaygroundWidget extends Disposable {
	private readonly city = observableValue(this, 'Zurich');
	private readonly measurementKind = observableValue<'temperature' | 'windspeed'>(this, 'temperature');
	private readonly cityPosition = derivedWithCancellationToken(this, (reader, token) =>
		new ObservablePromise(this._fetchLatitudeLongitudeOfCity(this.city.read(reader), token))
	);

	private readonly cityWeatherData = derivedWithCancellationToken(this, (reader, token) => {

		const measurementKind = this.measurementKind.read(reader);
		const pos = this.cityPosition.read(reader).promiseResult.read(reader)?.getDataOrThrow();
		if (!pos) { return undefined; }
		return new ObservablePromise(
			this._fetchWeatherMeasurement(pos.longitude.toString(), pos.latitude.toString(), measurementKind, token)
		);
	});

	private readonly cityWeatherDataFormattedValue = derived(this, reader => {
		const data = this.cityWeatherData.read(reader);
		if (!data) {
			return 'Loading pos data...';
		}
		const result = data.promiseResult.read(reader);
		if (!result) {
			return 'Loading weather data...';
		}
		return 'value: ' + result.getDataOrThrow();
	});

	private readonly title = derived(this, reader => `${this.measurementKind.read(reader)} in ${this.city.read(reader)}: ${this.cityWeatherDataFormattedValue.read(reader)}`);

	constructor(private readonly dom: HTMLDivElement) {
		super();
		dom.replaceChildren();

		this._register(autorun(reader => {
			/** @description writeTitleToLog */
			this._log('title: ' + this.title.read(reader));
		}));

		setTimeout(() => {
			transaction(tx => {
				this.city.set('Redmond', tx);
			});

		}, 500);
	}

	private async _fetchLatitudeLongitudeOfCity(city: string, cancellationToken: CancellationToken = CancellationToken.None): Promise<{ latitude: number; longitude: number }> {
		this._log(`fetchLatitudeLongitudeOfCity ${city}: Start`, true);

		try {
			await timeout(1000, cancellationToken);
		} catch (e) {
			this._log(`fetchLatitudeLongitudeOfCity ${city}: Cancelled`, true);
			throw e;
		}

		const result = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + city);
		const data = await result.json();
		const first = data.results[0];
		this._log(`fetchLatitudeLongitudeOfCity ${city}: Completed - latitute: ${first.latitude}, longitude: ${first.longitude}`, true);
		return { latitude: first.latitude, longitude: first.longitude };
	}

	private async _fetchWeatherMeasurement(long: string, lat: string, measurementKind: 'temperature' | 'windspeed', cancellationToken: CancellationToken = CancellationToken.None): Promise<number> {
		this._log(`fetchWeatherMeasurement ${measurementKind} (${lat}, ${long})`, true);

		try {
			await timeout(1000, cancellationToken);
		} catch (e) {
			this._log(`fetchWeatherMeasurement ${measurementKind} (${long}, ${lat}): Cancelled`, true);
			throw e;
		}

		const kind = measurementKind === 'temperature' ? 'temperature_2m' : 'wind_speed_10m';
		const result = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + long + '&current=' + kind);
		const data = await result.json();
		this._log(`fetchWeatherMeasurement ${measurementKind} (${lat}, ${long}): Completed ${data.current[kind]}`, true);
		return data.current[kind];
	}

	private msgCount = 0;

	private _log(message: string, grey: boolean = false) {
		this.msgCount++;
		const elem = this.dom.appendChild(h('ul', [`* ${this.msgCount} - [${getTimeOfDay()}]: ${message}`]).root);
		if (grey) {
			elem.style.color = 'lightgrey';
		}
	}
}


function getTimeOfDay(): string {
	const now = new Date();
	const hours = pad(now.getHours(), 2);
	const minutes = pad(now.getMinutes(), 2);
	const seconds = pad(now.getSeconds(), 2);
	const milliseconds = pad(now.getMilliseconds(), 3);
	return `${hours}:${minutes}:${seconds}:${milliseconds}`;
}

function pad(num: number, size: number) {
	let s = num.toString();
	while (s.length < size) {
		s = '0' + s;
	}
	return s;
}
