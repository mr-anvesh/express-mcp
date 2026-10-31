import app from './app.js';
import { generateMcpServer } from '../../dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function main() {
    try {
        await generateMcpServer(app, {
            expressBaseUrl: 'http://localhost:3000',
            outputPath: path.join(__dirname, 'mcp-server.ts'),
            typescript: true,
            transport: 'stdio',
        });
        console.log('\n✓ MCP server generated successfully!');
        console.log('\nTo use the MCP server:');
        console.log('1. Start your Express server: node examples/simple-api/server.js');
        console.log('2. Run the MCP server: node examples/simple-api/mcp-server.ts');
    }
    catch (error) {
        console.error('Error generating MCP server:', error.message);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=generate.js.map