import app from './app.js';
import { generateMcpServer } from '../../dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const proxy = process.argv.includes('--proxy');
    const outputPath = path.join(__dirname, 'mcp-server.js');
    await generateMcpServer(app, {
      ...(proxy
        ? { mode: 'proxy' as const, expressBaseUrl: 'http://localhost:3000' }
        : { mode: 'import' as const, appModule: './app.js' }),
      outputPath,
      typescript: false,
      transport: 'stdio',
    });

    if (proxy) console.log('Start the API with node server.js');
    console.log(`Start the MCP server with node "${outputPath}"`);
  } catch (error: any) {
    console.error('Error generating MCP server:', error.message);
    process.exit(1);
  }
}

main();
