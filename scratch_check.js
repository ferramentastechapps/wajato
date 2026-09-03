async function run() {
  const r = await fetch('http://localhost:8080/chat/whatsappNumbers/amanda', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: 'wajato_global_api_key_5544'
    },
    body: JSON.stringify({ numbers: ['5516982099936'] })
  });
  console.log('Status:', r.status);
  console.log('Result:', await r.json());
}
run();
