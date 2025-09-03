import 'dotenv/config';
import { runSupervisor } from './supervisor.js';

async function main() {
  const query = 'I need a device to relax my neck and shoulders after work';
  const res = await runSupervisor(query);
  console.log('Result:', JSON.stringify(res, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
