const express = require('express');
const bodyParser = require('body-parser');
const _ = require('lodash');

const app = express();

app.use(bodyParser.json());

const users = [
	{
		_id: 0,
		name: 'John Smith',
		email: 'john@gmail.com',
		phone: '812-132-2123',
		status: 'Good',
		inBed: true,
		records: [
			{
				rr: 10,
				hrv: 100,
				ss: 80,
				status: 2,
				hr: 73,
				time: new Date().getTime(),
			},
		],
	},
];

app.get('/users/:id', (req, res) => {
	const user = users.find(u => u._id === parseInt(req.params.id, 10));

	if (!user) return res.send({});

	res.send(user);
});

app.post('/users/:id/record', (req, res) => {
	const record = _.pick(req.body, ['rr', 'hrv', 'ss', 'status', 'hr']);

	record.time = new Date().getTime();

	const user = users.find(u => u._id === parseInt(req.params.id, 10));

	if (!user) return res.send({});

	user.records.unshift(record);

	res.send(user);
});

app.listen(3000, () => {
	console.log('Listening on port 3000');
});
