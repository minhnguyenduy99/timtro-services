/**
 * Gọi thử timtro MCP qua stdio (initialize → initialized → tools/call).
 * Chạy: pnpm smoke
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const proc = spawn('node', ['apps/timtro-mcp/dist/server.mjs'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
});

const linesToSend = [
    {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'smoke-call', version: '1.0.0' }
        }
    },
    {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
    },
    {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
            name: 'rentals_cache_stats',
            arguments: {}
        }
    },
    {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'search_rentals',
            arguments: {
                area_query: 'Bình Thạnh',
                max_price_vnd: 3_000_000,
                limit: 5
            }
        }
    }
];

for (const msg of linesToSend) {
    proc.stdin.write(`${JSON.stringify(msg)}\n`);
}
proc.stdin.end();

let stdoutBuf = '';
proc.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
});

proc.stderr.on('data', (chunk) => {
    process.stderr.write(`[server stderr] ${chunk}`);
});

proc.on('close', (code) => {
    console.log('--- STDOUT (parsed JSON-RPC responses) ---\n');
    for (const line of stdoutBuf.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try {
            msg = JSON.parse(trimmed);
        } catch {
            console.log(trimmed);
            continue;
        }
        if (msg.jsonrpc !== '2.0') continue;
        if ('id' in msg && msg.result !== undefined) {
            console.log(`✓ id=${msg.id} result:`);
            console.log(JSON.stringify(msg.result, null, 2));
            console.log('');
        } else if ('id' in msg && msg.error) {
            console.log(`✗ id=${msg.id} error:`, msg.error);
            console.log('');
        }
    }
    console.log(`(process exited ${code})`);
});
