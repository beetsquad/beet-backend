const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const losant = require('losant-rest');

const app = express();

app.use(bodyParser.json());

axios.defaults.headers.common.Authorization =
	'Bearer c648ea06-7c64-4a13-95d8-17b87a418669';

const user = {
	email: 'john@gmail.com',
	phone: '812-132-2123',
	status: 'Good',
	wasOccupied: null,
	hrSent: false,
	rrSent: true,
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

function getResults(record) {
	const results = [];

	if ((!user.rrSent && record.rr > 15) || record.rr < 6) {
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

	if (
		!user.hrSent &&
		record.hr !== 0 &&
		(record.hr < 50 || record.hr > 120)
	) {
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
		console.log('Abnormal data detected');

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
					console.log(
						'Successfully sent message to EHR:',
						result.Description,
					),
				);
			})
			.catch(() => {
				results.forEach(result =>
					console.log(
						'Failed to send message to EHR:',
						result.Description,
					),
				);
			});
	}
}

function analyzeSleepData() {
	return {
		quality: 3.13,
	};
}

function sendSleepData() {
	const sleepData = analyzeSleepData(user.records);

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
			console.log('Successfully logged sleep quality to EHR:', 3.13);
		})
		.catch(() => {
			console.log('Failed to log sleep quality to EHR:', 3.13);
		});
}

function getDeviceData() {
	setTimeout(() => {
		const client = losant.createClient();
		client.auth
			.authenticateDevice({
				credentials: {
					deviceId: '5aedf95eb107570008305734',
					key: '7472a9c2-dc4f-4d10-964c-0fbb2f7a9ca9',
					secret:
						'85f7ee26e81e4f1e0ab3fbd70adc5f07305e68e4c5fea88d047e21b2f1151167',
				},
			})
			.then(res => {
				client.setOption('accessToken', res.token);
				const params = {
					applicationId: res.applicationId,
					deviceId: res.deviceId,
				};

				client.device.getState(params).then(r => {
					const record = r[0].data;

					if (record.occupied && !user.wasOccupied)
						user.wasOccupied = true;

					if (record.occupied) {
						record.time = new Date().getTime();
						console.log(record);
						addRecord(record);
					}

					if (!record.occupied && user.wasOccupied) {
						sendSleepData();
					}

					getDeviceData();
				});
			});
	}, 1000);
}

app.listen(3000, getDeviceData);
