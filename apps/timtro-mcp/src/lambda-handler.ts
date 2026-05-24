import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';

import { DELETE, GET, POST } from './mcp-http-handler';

const app = new Hono();

app.get('/mcp', async (c) => GET(c.req.raw));
app.post('/mcp', async (c) => POST(c.req.raw));
app.delete('/mcp', async (c) => DELETE(c.req.raw));

export const handler = handle(app);
