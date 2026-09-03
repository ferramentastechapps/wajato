const { Queue } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis('redis://127.0.0.1:6379');
const queue = new Queue('message-queue', { connection: redis });

async function check() {
  const counts = await queue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting', 'paused');
  console.log('Job counts:', counts);

  const delayed = await queue.getDelayed(0, 10);
  console.log('Delayed jobs count:', delayed.length);
  for (const j of delayed) {
    console.log(`Delayed job ${j.id}: delay=${j.opts.delay}, timestamp=${j.timestamp}, delayUntil=${j.timestamp + j.opts.delay}, now=${Date.now()}`);
  }

  const waiting = await queue.getWaiting(0, 10);
  console.log('Waiting jobs count:', waiting.length);
  for (const j of waiting) {
    console.log(`Waiting job ${j.id}`);
  }

  const active = await queue.getActive(0, 10);
  console.log('Active jobs count:', active.length);
  for (const j of active) {
    console.log(`Active job ${j.id}`);
  }

  process.exit(0);
}

check();
