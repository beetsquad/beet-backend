const express = require('express');
const axios = require('axios');
const losant = require('losant-rest');
const FitbitApiClient = require('fitbit-node');
const moment = require('moment');
const cors = require('./middleware/cors');

const app = express();

app.use(cors);

const fClient = new FitbitApiClient({
	clientId: '22CRJR',
	clientSecret: '7d3e2e8b4fdd90ff390ba61119d5fe1a',
	apiVersion: '1.2',
});

const fitbitAuth =
	'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2TTJNUUIiLCJhdWQiOiIyMkNSSlIiLCJpc3MiOiJGaXRiaXQiLCJ0eXAiOiJhY2Nlc3NfdG9rZW4iLCJzY29wZXMiOiJ3aHIgd3NsZSB3d2VpIiwiZXhwIjoxNTI1NjQyNDc1LCJpYXQiOjE1MjU2MTM2NzV9.NzJjwFyeqjeZttJh1GLDuTbGN42OR7EqbiMCQufOoao';
axios.defaults.headers.common.Authorization =
	'Bearer c648ea06-7c64-4a13-95d8-17b87a418669';

const user = {
	email: 'john@gmail.com',
	phone: '812-132-2123',
	status: 'Good',
	wasOccupied: null,
	hrSent: false,
	rrSent: false,
	sleepDataSent: false,
	identifiers: [
		{
			ID: '0000000001',
			IDType: 'MR',
		},
	],
	demographics: {
		FirstName: 'Timothy',
		LastName: 'Bixby',
		DOB: '2008-01-06T00:00:00.000Z',
	},
	records: [],
};

function printColor(text, color) {
	console.log(`${color}${text}\x1b[0m`);
}

function getResults(record) {
	const results = [];

	if (!user.rrSent && record.rr !== 0 && (record.rr > 15 || record.rr < 6)) {
		user.rrSent = true;

		results.push({
			Code: `RESP${new Date().getTime()}`,
			Description: 'Abnormal Respiratory Rate',
			Value: record.rr,
			ValueType: 'Numeric',
			AbnormalFlag: true,
			Status: 'Final',
		});
	}

	if (!user.hrSent && record.hr !== 0 && (record.hr < 50 || record.hr > 90)) {
		user.hrSent = true;

		results.push({
			Code: `HR${new Date().getTime()}`,
			Description: 'Abnormal Heart Rate',
			Value: record.hr,
			ValueType: 'Numeric',
			AbnormalFlag: true,
			Status: 'Final',
		});
	}

	return results;
}

function addRecord(record) {
	user.records.unshift(record);

	const results = getResults(record);

	if (results.length > 0) {
		printColor('Abnormal data detected', '\x1b[33m');

		axios
			.post('https://api.redoxengine.com/endpoint', {
				Meta: {
					DataModel: 'Results',
					EventType: 'New',
				},
				Patient: {
					Identifiers: user.identifiers,
					Demographics: user.demographics,
				},
				Orders: [
					{
						ID: new Date().getTime(),
						Status: 'Resulted',
						Results: results,
					},
				],
			})
			.then(() => {
				results.forEach(result =>
					printColor(
						`Successfully sent message to EHR: ${
							result.Description
						}`,
						'\x1b[32m',
					),
				);
			})
			.catch(() => {
				results.forEach(
					result =>
						printColor(
							`Failed to send message to EHR: ${
								result.Description
							}`,
						),
					'\x1b[31m',
				);
			});
	}
}

function analyzeSleepData(records) {
	return {
		startTime: moment(records[records.length - 1].time).format('HH:mm'),
		duration: records[0].time - records[records.length - 1].time,
		quality: 3.13,
	};
}

function sendSleepData() {
	if (user.records.length <= 0) return;

	const sleepData = analyzeSleepData(user.records);
	user.records = [];

	console.log('sleepData:', sleepData);

	axios
		.post('https://api.redoxengine.com/endpoint', {
			Meta: {
				DataModel: 'Results',
				EventType: 'New',
			},
			Patient: {
				Identifiers: user.identifiers,
				Demographics: user.demographics,
			},
			Orders: [
				{
					ID: new Date().getTime(),
					Status: 'Resulted',
					Results: [
						{
							Code: `SLP${new Date().getTime()}`,
							Description: 'Sleep Quality',
							Value: sleepData.quality,
							ValueType: 'Numeric',
							Status: 'Final',
						},
					],
				},
			],
		})
		.then(() => {
			user.sleepDataSent = true;
			printColor(
				`Successfully logged sleep quality to EHR: ${
					sleepData.quality
				}`,
				'\x1b[32m',
			);
		})
		.catch(() => {
			printColor(
				`Failed to log sleep quality to EHR: ${sleepData.quality}`,
				'\x1b[31m',
			);
		});

	fClient
		.post('/sleep.json', fitbitAuth, {
			date: moment().format('YYYY-MM-DD'),
			duration: sleepData.duration,
			startTime: sleepData.startTime,
		})
		.then(results => {
			user.sleepDataSent = true;
			if (results[0].errors)
				return printColor(
					`Failed to log sleep data to FitBit: ${results[0].errors}`,
					'\x1b[31m',
				);

			printColor('Successfully logged sleep data to FitBit', '\x1b[32m');
		})
		.catch(err => {
			console.log(err);
		});
}

function getDeviceData() {
	setTimeout(() => {
		const lClient = losant.createClient();
		lClient.auth
			.authenticateDevice({
				credentials: {
					deviceId: '5aef13184fb3b400073acf59',
					key: '6b71d022-dab7-4ec5-afe1-899d5eeeeeaf',
					secret:
						'd86129793c5be5919bea272f7e344ff77465e1fe1f9ea21099f58fbd7fbd1e2b',
				},
			})
			.then(res => {
				lClient.setOption('accessToken', res.token);
				const params = {
					applicationId: res.applicationId,
					deviceId: res.deviceId,
				};

				lClient.device.getState(params).then(r => {
					const record = r[0].data;

					record.time = new Date().getTime();

					console.log({
						hr: record.hr,
						rr: record.rr,
						time: record.time,
						occupied: record.occupied,
					});

					if (record.occupied && !user.wasOccupied)
						user.wasOccupied = true;

					if (record.occupied) addRecord(record);

					if (!record.occupied && user.wasOccupied) {
						user.wasOccupied = false;
						sendSleepData();
					}

					getDeviceData();
				});
			});
	}, 1000);
}

app.get('/apiStatus', (req, res) => {
	res.send({
		hrSent: user.hrSent,
		rrSent: user.rrSent,
		sleepDataSent: user.sleepDataSent,
	});
});

app.get('/authorize', (req, res) => {
	res.redirect(
		fClient.getAuthorizeUrl(
			'heartrate sleep weight',
			'http://localhost:3000/callback',
		),
	);
});

app.get('/callback', (req, res) => {
	fClient
		.getAccessToken(req.query.code, 'http://localhost:3000/callback')
		.then(result => {
			res.send(result.access_token);
		})
		.catch(err => {
			res.status(err.status).send(err);
		});
});

app.listen(5000, getDeviceData);
