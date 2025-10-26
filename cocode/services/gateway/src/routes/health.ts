import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
	res.status(200).json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		service: 'cocode-gateway'
	});
});
