const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis('redis://127.0.0.1:6379');
const queue = new Queue('message-queue', { connection: redis });

async function run() {
  const delayed = await queue.getDelayed();
  console.log('Total delayed in queue:', delayed.length);
  const byCamp = {};
  for (const j of delayed) {
    const cId = j.data?.campaignId || 'unknown';
    byCamp[cId] = (byCamp[cId] || 0) + 1;
  }
  console.log('Delayed by campaign:', byCamp);
  process.exit(0);
}
run();
